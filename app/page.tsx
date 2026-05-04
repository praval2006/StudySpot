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

const statusLabels: Record<StudyStatus, string> = {
  available: "Available",
  busy: "Busy",
  full: "Full"
};

const statusStyles: Record<StudyStatus, string> = {
  available: "bg-emerald-600 text-white",
  busy: "bg-amber-500 text-ink",
  full: "bg-red-600 text-white"
};

const selectedStatusButtonStyles: Record<StudyStatus, string> = {
  available: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400",
  busy: "border-amber-500 bg-amber-500 text-ink",
  full: "border-red-600 bg-red-600 text-white dark:border-red-400"
};

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
  const [isLocating, setIsLocating] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(true);

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

    // Browser geolocation gives the user's current coordinates.
    // Those coordinates are only stored in local React state, not in Firestore.
    // Low accuracy is much faster for this MVP because we only need campus-level distance.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationMessage("Location found. Distances are sorted from nearest first.");
        setLocationState("ready");
        setIsLocating(false);
      },
      () => {
        setLocationMessage(
          "Location permission was denied. You can type a campus location instead."
        );
        setLocationState("denied");
        setIsLocating(false);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000
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
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-5 text-ink transition-colors duration-200 dark:bg-[#101613] dark:text-[#eef5ef] sm:px-6 lg:px-8">
      {showLocationPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 px-4 backdrop-blur-sm dark:bg-black/65">
          <section
            aria-modal="true"
            role="dialog"
            className="w-full max-w-sm rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-soft dark:border-white/10 dark:bg-[#18221d]"
          >
            <p className="text-sm font-semibold text-gumleaf dark:text-emerald-300">
              StudySpotter
            </p>
            <h1 className="mt-2 text-2xl font-bold text-ink dark:text-white">
              Find nearby seats
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink/65 dark:text-white/70">
              Use your location for the nearest available University of Sydney study spot.
            </p>

            <button
              onClick={requestLocation}
              disabled={isLocating}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gumleaf px-5 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
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
                className="mt-2 min-h-11 w-full rounded-xl border border-ink/15 bg-white px-4 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-gumleaf focus:ring-2 focus:ring-gumleaf/15 dark:border-white/10 dark:bg-[#111a16] dark:text-white dark:placeholder:text-white/35 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/15"
              />
              <button
                type="submit"
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-ink/10 bg-white px-4 text-sm font-semibold text-ink transition hover:border-gumleaf hover:text-gumleaf active:scale-[0.99] dark:border-white/10 dark:bg-[#223027] dark:text-white dark:hover:border-emerald-400 dark:hover:text-emerald-300"
              >
                Use typed location
              </button>
            </form>

            <button
              onClick={() => setShowLocationPrompt(false)}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl text-sm font-semibold text-ink/55 transition hover:bg-ink/5 hover:text-ink dark:text-white/50 dark:hover:bg-white/5 dark:hover:text-white"
            >
              Continue without location
            </button>
          </section>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <datalist id="campus-location-suggestions">
          {campusSearchLocations.map((location) => (
            <option key={location.name} value={location.name} />
          ))}
        </datalist>

        <header className="flex flex-col gap-4 border-b border-ink/10 pb-5 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gumleaf dark:text-emerald-300">
              University of Sydney
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-normal text-ink dark:text-white">
              StudySpotter
            </h1>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-ink/10 bg-white px-4 text-sm font-semibold text-ink transition hover:border-gumleaf hover:text-gumleaf active:scale-[0.99] dark:border-white/10 dark:bg-[#18221d] dark:text-white dark:hover:border-emerald-400 dark:hover:text-emerald-300"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            <button
              type="button"
              onClick={requestLocation}
              disabled={isLocating}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gumleaf px-4 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
            >
              {isLocating ? "Finding..." : "Use current location"}
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-gumleaf/15 bg-white p-5 dark:border-emerald-400/15 dark:bg-[#18221d]">
          <p className="text-sm leading-6 text-ink/70 dark:text-white/70">
            Live seat availability is updated by students. Last updated times help you judge
            reliability.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {["No login required", "Your live location stays in your browser", "Only study spot status is saved"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-xl border border-ink/10 bg-[#f8faf7] px-3 py-2 text-sm font-semibold text-ink/75 dark:border-white/10 dark:bg-[#111a16] dark:text-white/75"
                >
                  {item}
                </div>
              )
            )}
          </div>
        </section>

        {firestoreError ? (
          <section className="rounded-2xl border border-amber-500/40 bg-amber-50 p-4 text-sm font-semibold text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100">
            {firestoreError}
          </section>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-2xl border border-gumleaf/30 bg-white p-5 shadow-soft dark:border-emerald-400/30 dark:bg-[#18221d]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gumleaf dark:text-emerald-300">
                  Best Study Spot Near You
                </p>
                <h2 className="mt-2 text-3xl font-bold text-ink dark:text-white">
                  {bestSpot ? bestSpot.name : "No recommendation yet"}
                </h2>
              </div>
              {bestSpot ? <StatusBadge status={bestSpot.status} /> : null}
            </div>

            <div className="mt-5 rounded-xl bg-[#eef4ed] p-4 dark:bg-[#111a16]">
              {bestSpot ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-ink/65 dark:text-white/65">Distance from you</p>
                    <p className="text-3xl font-bold text-ink dark:text-white">
                      {formatDistance(bestSpot.distance)}
                    </p>
                  </div>
                  <p className="max-w-xs text-sm leading-6 text-ink/70 dark:text-white/70">
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

          <div className="rounded-2xl border border-ink/10 bg-white p-5 dark:border-white/10 dark:bg-[#18221d]">
            <p className="text-sm font-semibold text-gumleaf dark:text-emerald-300">
              Location
            </p>
            <p className="mt-2 text-lg font-semibold text-ink dark:text-white">
              {locationMessage}
            </p>
            {locationState === "denied" ? (
              <p className="mt-3 rounded-xl border border-red-500/25 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-950/40 dark:text-red-200">
                Location permission is off. Type a campus place below to keep using
                recommendations.
              </p>
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
                className="min-h-12 w-full rounded-xl border border-ink/15 bg-white px-4 text-sm text-ink outline-none transition placeholder:text-ink/40 focus:border-gumleaf focus:ring-2 focus:ring-gumleaf/15 dark:border-white/10 dark:bg-[#111a16] dark:text-white dark:placeholder:text-white/35 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/15"
              />
              <div className="flex flex-wrap gap-2">
                {["Fisher Library", "Manning House", "Quadrangle"].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => useTypedLocation(suggestion)}
                    className="rounded-full border border-ink/10 bg-[#f8faf7] px-3 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-gumleaf hover:text-gumleaf dark:border-white/10 dark:bg-[#111a16] dark:text-white/70 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-gumleaf px-4 text-sm font-semibold text-white transition hover:bg-[#255a4c] active:scale-[0.99] dark:bg-emerald-500 dark:text-[#07110d] dark:hover:bg-emerald-400"
              >
                Update location
              </button>
            </form>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gumleaf dark:text-emerald-300">
                All Study Spots
              </p>
              <h2 className="mt-1 text-2xl font-bold text-ink dark:text-white">
                Campus availability
              </h2>
            </div>
            <p className="text-sm text-ink/60 dark:text-white/60">
              {locationsWithDistance.length} spots
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {locationsWithDistance.map((location) => (
              <article
                key={location.id}
                className="rounded-2xl border border-ink/10 bg-white p-5 transition hover:border-gumleaf/35 hover:shadow-soft dark:border-white/10 dark:bg-[#18221d] dark:hover:border-emerald-400/35"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-ink dark:text-white">
                      {location.name}
                    </h3>
                    <p className="mt-2 text-sm text-ink/60 dark:text-white/60">
                      Last updated {formatUpdatedAt(location.updatedAt)}
                    </p>
                  </div>
                  <StatusBadge status={location.status} />
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl bg-[#eef4ed] px-4 py-3 dark:bg-[#111a16]">
                  <span className="text-sm text-ink/65 dark:text-white/65">Distance</span>
                  <span className="text-lg font-bold text-ink dark:text-white">
                    {formatDistance(location.distance)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(Object.keys(statusLabels) as StudyStatus[]).map((status) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(location.id, status)}
                      className={`min-h-12 rounded-xl border px-2 text-sm font-semibold transition hover:border-gumleaf hover:text-gumleaf active:scale-[0.98] dark:hover:border-emerald-400 dark:hover:text-emerald-300 ${
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
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: StudyStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}

function formatUpdatedAt(updatedAt: Timestamp | null) {
  if (!updatedAt) {
    return "just now";
  }

  return new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short"
  }).format(updatedAt.toDate());
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
