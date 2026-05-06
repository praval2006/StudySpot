"use client";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  seedStudyLocations,
  StudyStatus,
  type SeedStudyLocation
} from "@/lib/studyLocations";

type UserLocation = {
  lat: number;
  lng: number;
};

type StudyLocation = SeedStudyLocation & {
  updatedAt: Timestamp | null;
};

type CampusSearchLocation = {
  name: string;
  lat: number;
  lng: number;
};

type ThemePreference = "light" | "dark";
type LocationState = "idle" | "locating" | "ready" | "denied" | "manual" | "error";
type AppView = "recommendation" | "dashboard";

const statusLabels: Record<StudyStatus, string> = {
  available: "Available",
  busy: "Busy",
  full: "Full"
};

const statusStyles: Record<StudyStatus, string> = {
  available: "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-[#07110d]",
  busy: "bg-amber-500 text-[#211605]",
  full: "bg-red-700 text-white dark:bg-red-500 dark:text-white"
};

const selectedStatusButtonStyles: Record<StudyStatus, string> = {
  available:
    "border-emerald-700 bg-emerald-700 text-white shadow-sm dark:border-emerald-400 dark:bg-emerald-500 dark:text-[#07110d]",
  busy: "border-amber-500 bg-amber-500 text-[#211605] shadow-sm",
  full:
    "border-red-700 bg-red-700 text-white shadow-sm dark:border-red-400 dark:bg-red-500"
};

const geolocationErrorCodes = {
  permissionDenied: 1,
  positionUnavailable: 2,
  timeout: 3
} as const;

const initialStudyLocations: StudyLocation[] = seedStudyLocations.map((location) => ({
  ...location,
  updatedAt: null
}));

const campusSearchLocations: CampusSearchLocation[] = [
  ...seedStudyLocations.map(({ name, lat, lng }) => ({ name, lat, lng })),
  {
    name: "Quadrangle",
    lat: -33.8863,
    lng: 151.1873
  },
  {
    name: "Manning House",
    lat: -33.8857,
    lng: 151.1892
  },
  {
    name: "Carslaw Building",
    lat: -33.8881,
    lng: 151.1906
  },
  {
    name: "USYD Business School",
    lat: -33.8848,
    lng: 151.1945
  },
  {
    name: "Redfern Station",
    lat: -33.8917,
    lng: 151.1989
  },
  {
    name: "Victoria Park",
    lat: -33.886,
    lng: 151.193
  }
];

export default function Home() {
  const [locations, setLocations] = useState<StudyLocation[]>(initialStudyLocations);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [typedLocation, setTypedLocation] = useState("");
  const [theme, setTheme] = useState<ThemePreference>("light");
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [firestoreError, setFirestoreError] = useState("");
  const [locationMessage, setLocationMessage] = useState(
    "Share your location to find the closest spot."
  );
  const [locationHelp, setLocationHelp] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(true);
  const [appView, setAppView] = useState<AppView>("recommendation");

  useEffect(() => {
    // Theme logic:
    // use a saved preference if one exists, otherwise follow the user's system theme.
    const savedTheme = window.localStorage.getItem("studyspotter-theme") as
      | ThemePreference
      | null;
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = savedTheme ?? (systemPrefersDark ? "dark" : "light");

    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, []);

  function toggleTheme() {
    // UI state handling:
    // keep the theme in React, on the html class for Tailwind, and in localStorage.
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("studyspotter-theme", nextTheme);
  }

  useEffect(() => {
    async function seedLocationsIfNeeded() {
      const snapshot = await getDocs(collection(db, "locations"));

      if (!snapshot.empty) {
        return;
      }

      await Promise.all(
        seedStudyLocations.map((location) =>
          setDoc(doc(db, "locations", location.id), {
            name: location.name,
            lat: location.lat,
            lng: location.lng,
            status: location.status,
            updatedAt: serverTimestamp()
          })
        )
      );
    }

    seedLocationsIfNeeded().catch(() => {
      setFirestoreError("Firestore could not seed locations. Check your Firebase setup.");
    });
  }, []);

  useEffect(() => {
    const locationsQuery = query(collection(db, "locations"), orderBy("name"));

    const unsubscribe = onSnapshot(
      locationsQuery,
      (snapshot) => {
        setFirestoreError("");

        if (snapshot.empty) {
          return;
        }

        const firestoreLocations = snapshot.docs.map((locationDoc) => {
          const data = locationDoc.data();

          return {
            id: locationDoc.id,
            name: String(data.name),
            lat: Number(data.lat),
            lng: Number(data.lng),
            status: data.status as StudyStatus,
            updatedAt: (data.updatedAt as Timestamp | undefined) ?? null
          };
        });

        const firestoreLocationById = new Map(
          firestoreLocations.map((location) => [location.id, location])
        );

        // Firestore sync logic:
        // show the hard-coded campus spots immediately, then replace their status and
        // timestamp with live Firestore data as soon as it arrives.
        setLocations((currentLocations) =>
          currentLocations.map((location) => firestoreLocationById.get(location.id) ?? location)
        );
      },
      () => {
        setFirestoreError(
          "Live Firestore data could not load. Showing saved campus locations for now."
        );
      }
    );

    return () => unsubscribe();
  }, []);

  const locationsWithDistance = useMemo(() => {
    return locations
      .map((location) => ({
        ...location,
        distance:
          userLocation === null
            ? null
            : getDistanceInMeters(userLocation, {
                lat: location.lat,
                lng: location.lng
              })
      }))
      .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE));
  }, [locations, userLocation]);

  const rankedLocations = useMemo(() => {
    const finiteDistances = locationsWithDistance
      .map((location) => location.distance)
      .filter((distance): distance is number => distance !== null);
    const nearestDistance = finiteDistances.length > 0 ? Math.min(...finiteDistances) : 0;
    const furthestDistance = finiteDistances.length > 0 ? Math.max(...finiteDistances) : 0;
    const distanceRange = Math.max(furthestDistance - nearestDistance, 1);

    // Ranking logic:
    // combines closeness and emptiness so students can compare all options.
    // Available spots score highest, busy spots stay useful, full spots rank lowest.
    return locationsWithDistance
      .map((location) => {
        const availabilityScore = getAvailabilityScore(location.status);
        const distanceScore =
          location.distance === null
            ? 0
            : 100 - ((location.distance - nearestDistance) / distanceRange) * 100;
        const rankScore = Math.round(availabilityScore * 0.58 + distanceScore * 0.42);

        return {
          ...location,
          rankScore
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore || (a.distance ?? 0) - (b.distance ?? 0))
      .map((location, index) => ({
        ...location,
        rank: index + 1
      }));
  }, [locationsWithDistance]);

  const bestSpot = useMemo(() => {
    if (locationsWithDistance.length === 0) {
      return null;
    }

    // Recommendation logic:
    // 1. Prefer study spots marked "available".
    // 2. If none are available, fall back to spots marked "busy".
    // 3. Full spots are only shown in the list, not recommended.
    const availableSpots = locationsWithDistance.filter(
      (location) => location.status === "available"
    );
    const busySpots = locationsWithDistance.filter((location) => location.status === "busy");
    const recommendationPool = availableSpots.length > 0 ? availableSpots : busySpots;

    return recommendationPool[0] ?? null;
  }, [locationsWithDistance]);

  const hasAvailableSpot = locationsWithDistance.some(
    (location) => location.status === "available"
  );
  const hasRecommendationCandidate = locationsWithDistance.some(
    (location) => location.status === "available" || location.status === "busy"
  );

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support live location.");
      setLocationState("error");
      setShowLocationPrompt(false);
      return;
    }

    setIsLocating(true);
    setLocationState("locating");
    setShowLocationPrompt(false);
    setLocationMessage("Finding your location...");
    setLocationHelp("");

    let hasFinishedLocationRequest = false;
    let watchId: number | null = null;
    let mobileTimeoutId: number | null = null;

    function stopWatchingLocation() {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (mobileTimeoutId !== null) {
        window.clearTimeout(mobileTimeoutId);
        mobileTimeoutId = null;
      }
    }

    function usePosition(position: GeolocationPosition) {
      if (hasFinishedLocationRequest) {
        return;
      }

      hasFinishedLocationRequest = true;
      stopWatchingLocation();
      setUserLocation({
        lat: position.coords.latitude,
        lng: position.coords.longitude
      });
      setLocationMessage("Location found. Distances are sorted from nearest first.");
      setLocationHelp("");
      setLocationState("ready");
      setAppView("recommendation");
      setIsLocating(false);
    }

    function handleLocationError(error: GeolocationPositionError) {
      if (hasFinishedLocationRequest) {
        return;
      }

      hasFinishedLocationRequest = true;
      stopWatchingLocation();
      const locationError = getLocationError(error);

      setLocationMessage(locationError.message);
      setLocationHelp(locationError.help);
      setLocationState(locationError.state);
      setAppView("dashboard");
      setIsLocating(false);
    }

    // Browser geolocation gives the user's current coordinates.
    // Those coordinates are only stored in local React state, not in Firestore.
    // Mobile browsers can be slow or inconsistent with getCurrentPosition, so
    // watchPosition runs as a backup and whichever method returns first wins.
    watchId = navigator.geolocation.watchPosition(usePosition, undefined, {
      enableHighAccuracy: true,
      timeout: 25000,
      maximumAge: 0
    });
    mobileTimeoutId = window.setTimeout(() => {
      if (!hasFinishedLocationRequest) {
        handleLocationError(createLocationTimeoutError());
      }
    }, 28000);

    navigator.geolocation.getCurrentPosition(
      usePosition,
      (firstError) => {
        if (
          firstError.code === geolocationErrorCodes.permissionDenied &&
          !isMobileBrowser()
        ) {
          handleLocationError(firstError);
          return;
        }

        setLocationMessage("Still finding your phone's location...");

        navigator.geolocation.getCurrentPosition(usePosition, handleLocationError, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 120000
      }
    );
  }

  function useTypedLocation(searchText = typedLocation) {
    const trimmedLocation = searchText.trim();

    if (trimmedLocation.length === 0) {
      setLocationMessage("Type a campus location first.");
      return;
    }

    // Typed location logic:
    // this MVP does not call a maps/geocoding API. Instead, it matches the text
    // against known campus places and uses their saved latitude/longitude.
    const matchedLocation = findCampusLocation(trimmedLocation);
    const coordinateLocation = parseCoordinates(trimmedLocation);
    const selectedLocation = matchedLocation ?? coordinateLocation;

    if (!selectedLocation) {
      setLocationMessage(
        "Location not found. Try a suggested campus place or enter coordinates like -33.8869, 151.1895."
      );
      return;
    }

    setUserLocation({
      lat: selectedLocation.lat,
      lng: selectedLocation.lng
    });
    setTypedLocation("");
    setShowLocationPrompt(false);
    setLocationState("manual");
    setLocationHelp("");
    setAppView("recommendation");
    setLocationMessage(`Using ${selectedLocation.name}. Distances are sorted from nearest first.`);
  }

  async function updateStatus(locationId: string, status: StudyStatus) {
    // Status update logic:
    // update the local card immediately so a student can correct a mistaken tap
    // without waiting for Firestore to finish the previous write.
    setLocations((currentLocations) =>
      currentLocations.map((location) =>
        location.id === locationId
          ? {
              ...location,
              status,
              updatedAt: Timestamp.now()
            }
          : location
      )
    );

    try {
      await setDoc(
        doc(db, "locations", locationId),
        {
          status,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    } catch {
      setFirestoreError("Status could not be saved. Check Firestore rules and try again.");
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f5f1] px-3 py-3 text-ink transition-colors duration-200 dark:bg-[#121a16] dark:text-[#eef5ef] sm:px-5 lg:px-8">
      {showLocationPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4 dark:bg-[#060907]/70">
          <section
            aria-modal="true"
            role="dialog"
            className="w-full max-w-sm rounded-lg border border-ink/15 bg-white p-5 text-left shadow-soft dark:border-white/10 dark:bg-[#1a241f]"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-gumleaf dark:text-emerald-300">
              StudySpotter · USYD
            </p>
            <h1 className="mt-2 text-2xl font-bold text-ink dark:text-white">
              Find nearby seats
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink/70 dark:text-white/70">
              Use your location for the nearest available University of Sydney study spot.
            </p>

            <button
              onClick={requestLocation}
              disabled={isLocating}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-gumleaf px-5 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
            >
              {isLocating ? "Finding location..." : "Use my location"}
            </button>

            <form
              className="mt-4 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                useTypedLocation();
              }}
            >
              <label
                htmlFor="prompt-location"
                className="text-sm font-semibold text-ink dark:text-white"
              >
                Or type a campus place
              </label>
              <input
                id="prompt-location"
                list="campus-location-suggestions"
                value={typedLocation}
                onChange={(event) => setTypedLocation(event.target.value)}
                placeholder="e.g. Manning House"
                className="mt-2 min-h-11 w-full rounded-md border border-ink/20 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-gumleaf focus:ring-2 focus:ring-gumleaf/15 dark:border-white/10 dark:bg-[#111a16] dark:text-white dark:placeholder:text-white/35 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/15"
              />
              <button
                type="submit"
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-ink/15 bg-white px-4 text-sm font-semibold text-ink transition hover:border-gumleaf hover:bg-[#f3f7f1] hover:text-gumleaf active:translate-y-px dark:border-white/10 dark:bg-[#223027] dark:text-white dark:hover:border-emerald-400 dark:hover:bg-[#26352d] dark:hover:text-emerald-300"
              >
                Use typed location
              </button>
            </form>

            <button
              onClick={() => {
                setShowLocationPrompt(false);
                setAppView("dashboard");
              }}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md text-sm font-semibold text-ink/60 transition hover:bg-ink/5 hover:text-ink active:translate-y-px dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white"
            >
              Continue without location
            </button>
          </section>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <datalist id="campus-location-suggestions">
          {campusSearchLocations.map((location) => (
            <option key={location.name} value={location.name} />
          ))}
        </datalist>

        <header className="flex flex-col gap-3 border-b border-ink/10 bg-[#f3f5f1] pb-4 pt-1 dark:border-white/10 dark:bg-[#121a16] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-normal text-ink dark:text-white sm:text-3xl">
              StudySpotter
            </h1>
            <p className="mt-1 text-sm font-medium text-ink/65 dark:text-white/65">
              Find available study spots at USYD faster.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ink/15 bg-white px-4 text-sm font-semibold text-ink transition hover:border-gumleaf hover:bg-[#f8faf7] hover:text-gumleaf active:translate-y-px dark:border-white/10 dark:bg-[#1a241f] dark:text-white dark:hover:border-emerald-400 dark:hover:bg-[#223027] dark:hover:text-emerald-300"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button
              type="button"
              onClick={requestLocation}
              disabled={isLocating}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-gumleaf px-4 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
            >
              {isLocating ? "Finding..." : "Use current location"}
            </button>
          </div>
        </header>

        {appView === "recommendation" ? (
          <section className="grid gap-4 lg:grid-cols-[1.18fr_0.82fr]">
            <div className="rounded-lg border border-gumleaf/35 bg-white p-5 shadow-soft dark:border-emerald-400/30 dark:bg-[#1a241f]">
              <p className="text-xs font-bold uppercase tracking-wide text-gumleaf dark:text-emerald-300">
                Nearest Available Spot
              </p>
              <h2 className="mt-2 text-2xl font-bold text-ink dark:text-white sm:text-3xl">
                {bestSpot ? bestSpot.name : "No recommendation yet"}
              </h2>

              <div className="mt-4 border-y border-ink/10 bg-[#f7f9f5] py-4 dark:border-white/10 dark:bg-[#131d18]">
                {bestSpot ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/55 dark:text-white/55">
                        Distance
                      </p>
                      <p className="mt-1 text-3xl font-bold text-ink dark:text-white">
                        {formatDistance(bestSpot.distance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/55 dark:text-white/55">
                        Status
                      </p>
                      <div className="mt-2">
                        <StatusBadge status={bestSpot.status} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/55 dark:text-white/55">
                        Last updated
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink dark:text-white">
                        {formatRelativeUpdatedAt(bestSpot.updatedAt)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-ink/55 dark:text-white/55">
                        Rank #{getRankForLocation(rankedLocations, bestSpot.id)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-ink/70 dark:text-white/70">
                    Choose your current location or type a campus place to calculate the closest
                    study spot.
                  </p>
                )}
              </div>

              <p className="mt-3 text-sm leading-6 text-ink/70 dark:text-white/70">
                {!hasAvailableSpot && bestSpot
                  ? "No available spaces were found, so this is the closest busy option."
                  : "This result prioritises available seats first, then distance from your chosen location."}
              </p>
              <div className="mt-4 grid gap-2 text-xs font-semibold text-ink/65 dark:text-white/65 sm:grid-cols-3">
                {["Community updated", "Live updates from students", "Location stays on your device"].map(
                  (item) => (
                    <div
                      key={item}
                      className="flex min-h-9 items-center gap-2 rounded-md border border-ink/10 bg-[#fbfcfa] px-3 dark:border-white/10 dark:bg-[#111a16]"
                    >
                      <span className="h-2 w-2 rounded-full bg-gumleaf dark:bg-emerald-400" />
                      {item}
                    </div>
                  )
                )}
              </div>
            </div>

            <aside className="rounded-lg border border-ink/10 bg-white p-5 dark:border-white/10 dark:bg-[#1a241f]">
              <p className="text-xs font-bold uppercase tracking-wide text-gumleaf dark:text-emerald-300">
                Want more options?
              </p>
              <h3 className="mt-2 text-xl font-bold text-ink dark:text-white">
                Find other spots
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink/65 dark:text-white/65">
                Open the full dashboard to compare all study spaces, rankings, distances, and
                live seat updates.
              </p>
              <button
                onClick={() => setAppView("dashboard")}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-gumleaf px-4 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:translate-y-px dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
              >
                Show all study spots
              </button>
            </aside>
          </section>
        ) : (
          <>
        <section className="rounded-lg border border-gumleaf/20 bg-white p-4 dark:border-emerald-400/15 dark:bg-[#1a241f]">
          <p className="text-sm leading-6 text-ink/70 dark:text-white/70">
            Live seat availability is updated by students. Last updated times help you judge
            reliability.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {["Community updated", "Live updates from students", "Location stays on your device"].map(
              (item) => (
                <div
                  key={item}
                  className="flex min-h-10 items-center gap-2 rounded-md border border-ink/10 bg-[#f8faf7] px-3 py-2 text-sm font-semibold text-ink/75 dark:border-white/10 dark:bg-[#111a16] dark:text-white/75"
                >
                  <span className="h-2 w-2 rounded-full bg-gumleaf dark:bg-emerald-400" />
                  {item}
                </div>
              )
            )}
          </div>
        </section>

        {firestoreError ? (
          <section className="rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100">
            {firestoreError}
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-lg border border-gumleaf/35 bg-white p-5 shadow-soft dark:border-emerald-400/30 dark:bg-[#1a241f]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gumleaf dark:text-emerald-300">
                  Nearest Available Spot
                </p>
                <h2 className="mt-2 text-2xl font-bold text-ink dark:text-white">
                  {bestSpot ? bestSpot.name : "No recommendation yet"}
                </h2>
              </div>
              {bestSpot ? <StatusBadge status={bestSpot.status} /> : null}
            </div>

            <div className="mt-4 border-y border-ink/10 bg-[#f7f9f5] py-4 dark:border-white/10 dark:bg-[#131d18]">
              {bestSpot ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/55 dark:text-white/55">
                      Distance
                    </p>
                    <p className="mt-1 text-3xl font-bold text-ink dark:text-white">
                      {formatDistance(bestSpot.distance)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink/55 dark:text-white/55">
                      Last updated
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink dark:text-white">
                      {formatRelativeUpdatedAt(bestSpot.updatedAt)}
                    </p>
                  </div>
                  <p className="text-sm leading-6 text-ink/70 dark:text-white/70">
                    {!hasAvailableSpot
                      ? "No available spots were found. This is the nearest busy option."
                      : "This is the nearest available study space right now."}
                  </p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-ink/70 dark:text-white/70">
                  {hasRecommendationCandidate
                    ? "Choose or share a location to calculate the closest study spot."
                    : "No available or busy spots were found. All known spots are currently full."}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white p-5 dark:border-white/10 dark:bg-[#1a241f]">
            <p className="text-xs font-bold uppercase tracking-wide text-gumleaf dark:text-emerald-300">
              Location
            </p>
            <p className="mt-2 text-lg font-semibold text-ink dark:text-white">
              {locationMessage}
            </p>
            {locationState === "denied" ? (
              <p className="mt-3 rounded-md border border-red-500/25 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200">
                {locationHelp ||
                  "Location permission is off. Type a campus place below to keep using recommendations."}
              </p>
            ) : null}
            {locationState === "error" ? (
              <p className="mt-3 rounded-md border border-amber-500/35 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:border-amber-400/35 dark:bg-amber-950/40 dark:text-amber-100">
                {locationHelp ||
                  "Your browser allowed location, but did not return a position. Check Location Services, then try current location again."}
              </p>
            ) : null}
            {(locationState === "denied" || locationState === "error") ? (
              <button
                type="button"
                onClick={requestLocation}
                disabled={isLocating}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-md border border-gumleaf/35 bg-white px-4 text-sm font-semibold text-gumleaf transition hover:bg-[#eef4ed] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70 dark:border-emerald-400/35 dark:bg-[#111a16] dark:text-emerald-300 dark:hover:bg-[#17231d]"
              >
                {isLocating ? "Finding..." : "Try current location again"}
              </button>
            ) : null}
            <p className="mt-4 text-sm leading-6 text-ink/65 dark:text-white/65">
              Your location is used in the browser to calculate distance. The app only writes
              study spot status and update time to Firestore.
            </p>

            <form
              className="mt-5 flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                useTypedLocation();
              }}
            >
              <label
                htmlFor="manual-location"
                className="text-sm font-semibold text-ink dark:text-white"
              >
                Type a campus location
              </label>
              <input
                id="manual-location"
                list="campus-location-suggestions"
                value={typedLocation}
                onChange={(event) => setTypedLocation(event.target.value)}
                placeholder="e.g. Quadrangle"
                className="min-h-12 w-full rounded-md border border-ink/20 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-gumleaf focus:ring-2 focus:ring-gumleaf/15 dark:border-white/10 dark:bg-[#111a16] dark:text-white dark:placeholder:text-white/35 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/15"
              />
              <div className="flex flex-wrap gap-2">
                {["Fisher Library", "Manning House", "Quadrangle"].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => useTypedLocation(suggestion)}
                    className="rounded-md border border-ink/10 bg-[#f8faf7] px-3 py-2 text-xs font-semibold text-ink/70 transition hover:border-gumleaf hover:bg-[#eef4ed] hover:text-gumleaf active:translate-y-px dark:border-white/10 dark:bg-[#111a16] dark:text-white/70 dark:hover:border-emerald-400 dark:hover:bg-[#17231d] dark:hover:text-emerald-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-gumleaf px-4 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:translate-y-px dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
              >
                Update location
              </button>
            </form>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gumleaf dark:text-emerald-300">
                All Study Spots
              </p>
              <h2 className="mt-1 text-xl font-bold text-ink dark:text-white">
                Campus availability
              </h2>
            </div>
            <p className="text-sm text-ink/60 dark:text-white/60">
              {rankedLocations.length} spots
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {rankedLocations.map((location) => (
              <article
                key={location.id}
                className="rounded-lg border border-ink/10 bg-white p-4 shadow-sm transition hover:border-gumleaf/35 hover:bg-[#fbfcfa] hover:shadow-md active:translate-y-px dark:border-white/10 dark:bg-[#1a241f] dark:hover:border-emerald-400/35 dark:hover:bg-[#1d2a23]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#eef4ed] px-2 py-1 text-xs font-bold text-gumleaf dark:bg-[#111a16] dark:text-emerald-300">
                        #{location.rank}
                      </span>
                      <h3 className="text-base font-bold leading-6 text-ink dark:text-white sm:text-lg">
                        {location.name}
                      </h3>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink/55 dark:text-white/55">
                      <span>updated {formatRelativeUpdatedAt(location.updatedAt)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${getActivityDotStyles(location.status)}`} />
                        {getActivityLabel(location.status)}
                      </span>
                      <span>score {location.rankScore}/100</span>
                    </div>
                  </div>
                  <StatusBadge status={location.status} />
                </div>

                <div className="mt-4 flex items-center justify-between rounded-md border border-ink/10 bg-[#f7f9f5] px-3 py-2.5 dark:border-white/10 dark:bg-[#111a16]">
                  <span className="text-sm text-ink/65 dark:text-white/65">Distance</span>
                  <span className="text-lg font-bold text-ink dark:text-white">
                    {formatDistance(location.distance)}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(Object.keys(statusLabels) as StudyStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(location.id, status)}
                      className={`min-h-12 rounded-md border px-2 text-sm font-semibold transition hover:border-gumleaf hover:bg-[#f3f7f1] hover:text-gumleaf active:translate-y-px dark:hover:border-emerald-400 dark:hover:bg-[#17231d] dark:hover:text-emerald-300 ${
                        location.status === status
                          ? selectedStatusButtonStyles[status]
                          : "border-ink/10 bg-white text-ink dark:border-white/10 dark:bg-[#111a16] dark:text-white"
                      }`}
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
          </>
        )}
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: StudyStatus }) {
  return (
    <span
      className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function formatRelativeUpdatedAt(updatedAt: Timestamp | null) {
  if (!updatedAt) {
    return "just now";
  }

  const updatedDate = updatedAt.toDate();
  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - updatedDate.getTime()) / 60000)
  );

  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  }

  if (elapsedMinutes < 1440) {
    const elapsedHours = Math.round(elapsedMinutes / 60);

    return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short"
  }).format(updatedAt.toDate());
}

function getActivityLabel(status: StudyStatus) {
  if (status === "available") {
    return "low activity";
  }

  if (status === "busy") {
    return "moderate activity";
  }

  return "high activity";
}

function getActivityDotStyles(status: StudyStatus) {
  if (status === "available") {
    return "bg-emerald-600 dark:bg-emerald-400";
  }

  if (status === "busy") {
    return "bg-amber-500";
  }

  return "bg-red-600 dark:bg-red-400";
}

function getLocationError(error: GeolocationPositionError): {
  message: string;
  help: string;
  state: LocationState;
} {
  if (error.code === geolocationErrorCodes.permissionDenied) {
    if (isInAppBrowser()) {
      return {
        message: "This in-app browser blocked location access.",
        help:
          "Open StudySpotter in Safari or Chrome, then tap Use current location again. WhatsApp's browser can block GPS even after you tap allow.",
        state: "error"
      };
    }

    return {
      message: "Location permission is off. You can type a campus location instead.",
      help:
        "Turn location permission on for this browser, then tap Try current location again.",
      state: "denied"
    };
  }

  if (error.code === geolocationErrorCodes.positionUnavailable) {
    return {
      message: "Location is allowed, but your phone could not find a position.",
      help:
        "Check that Location Services are on, step near a window if indoors, then try current location again.",
      state: "error"
    };
  }

  if (error.code === geolocationErrorCodes.timeout) {
    return {
      message: "Location is allowed, but your phone took too long to respond.",
      help: "Try current location again, or type a campus place if your GPS is slow indoors.",
      state: "error"
    };
  }

  return {
    message: "Location could not be found.",
    help: "Try current location again or type a campus place.",
    state: "error"
  };
}

function createLocationTimeoutError() {
  return {
    code: geolocationErrorCodes.timeout,
    message: "Location request timed out."
  } as GeolocationPositionError;
}

function isMobileBrowser() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function isInAppBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();

  return /whatsapp|instagram|fbav|fban|line|messenger|wv/.test(userAgent);
}

function formatDistance(distance: number | null) {
  if (distance === null) {
    return "Share location";
  }

  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  }

  return `${(distance / 1000).toFixed(1)} km`;
}

function getAvailabilityScore(status: StudyStatus) {
  if (status === "available") {
    return 100;
  }

  if (status === "busy") {
    return 55;
  }

  return 10;
}

function getRankForLocation(rankedLocations: Array<{ id: string; rank: number }>, locationId: string) {
  return rankedLocations.find((location) => location.id === locationId)?.rank ?? "-";
}

function findCampusLocation(searchText: string) {
  const normalizedSearch = normalizeLocationName(searchText);

  return campusSearchLocations.find((location) => {
    const normalizedName = normalizeLocationName(location.name);

    return normalizedName === normalizedSearch || normalizedName.includes(normalizedSearch);
  });
}

function parseCoordinates(searchText: string): CampusSearchLocation | null {
  const coordinateMatch = searchText.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
  );

  if (!coordinateMatch) {
    return null;
  }

  const lat = Number(coordinateMatch[1]);
  const lng = Number(coordinateMatch[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    name: "typed coordinates",
    lat,
    lng
  };
}

function normalizeLocationName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getDistanceInMeters(from: UserLocation, to: UserLocation) {
  const earthRadiusInMeters = 6371000;
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const latDifference = toRadians(to.lat - from.lat);
  const lngDifference = toRadians(to.lng - from.lng);

  // Haversine distance formula:
  // converts two latitude/longitude points into an approximate walking-radius distance.
  const haversine =
    Math.sin(latDifference / 2) * Math.sin(latDifference / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDifference / 2) *
      Math.sin(lngDifference / 2);
  const centralAngle = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusInMeters * centralAngle;
}

function toRadians(degrees: number) {
  return degrees * (Math.PI / 180);
}
