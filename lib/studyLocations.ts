export type StudyStatus = "available" | "busy" | "full";

export type SeedStudyLocation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: StudyStatus;
};

export const seedStudyLocations: SeedStudyLocation[] = [
  {
    id: "fisher-library",
    name: "Fisher Library",
    lat: -33.8869,
    lng: 151.1895,
    status: "busy"
  },
  {
    id: "law-library",
    name: "Law Library",
    lat: -33.8878,
    lng: 151.1934,
    status: "available"
  },
  {
    id: "scitech-library",
    name: "SciTech Library",
    lat: -33.8887,
    lng: 151.1901,
    status: "available"
  },
  {
    id: "wentworth-learning-hub",
    name: "Wentworth Learning Hub",
    lat: -33.8865,
    lng: 151.1909,
    status: "full"
  },
  {
    id: "susf-study-lounge",
    name: "Sports & Aquatic Centre Study Lounge",
    lat: -33.8912,
    lng: 151.1922,
    status: "busy"
  },
  {
    id: "abs-learning-hub",
    name: "Abercrombie Building Learning Hub",
    lat: -33.8847,
    lng: 151.1947,
    status: "available"
  }
];
