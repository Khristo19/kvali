// Real Sentinel-2 L2A crop health for the demo fields (task w11), copied from data/satellite/field-health.json.
// Contains modified Copernicus Sentinel data 2026 (Copernicus Sentinel-2 L2A via Copernicus Data Space Ecosystem).
// NDVI is a canopy vigour indicator only, not proof of spraying. Thresholds: good >= 0.55, medium 0.35 to < 0.55, poor < 0.35.
// To use other fields or live data, replace `RAW` / `getFieldHealth` here; the UI reads only `FieldHealth`.
import type { ImageSourcePropType } from "react-native";

export type HealthBand = "Poor" | "Medium" | "Good";

export const SATELLITE_ATTRIBUTION = "Contains modified Copernicus Sentinel data 2026";

export interface HealthPoint {
  /** ISO date (start of the 5-day interval). */
  date: string;
  /** Mean NDVI over the field, cloud-masked, 0..1. */
  index: number;
}

export interface SatPicture {
  date: string;
  cloudPct: number;
  source: ImageSourcePropType;
}

export interface FieldHealth {
  /** Newest reading. */
  latest: { date: string; index: number; cloudPct: number };
  /** Last 6 readings, oldest first. */
  series: HealthPoint[];
  /** True-colour pictures, newest first, with the area they cover ([west, south, east, north]). */
  pictures: SatPicture[];
  bbox: [number, number, number, number];
  size: [number, number];
}

const PICTURES: Record<string, ImageSourcePropType> = {
  "field-1-truecolor-2026-08-18.png": require("../../assets/satellite/field-1-truecolor-2026-08-18.png"),
  "field-1-truecolor-2026-09-27.png": require("../../assets/satellite/field-1-truecolor-2026-09-27.png"),
  "field-2-truecolor-2026-08-13.png": require("../../assets/satellite/field-2-truecolor-2026-08-13.png"),
  "field-2-truecolor-2026-09-24.png": require("../../assets/satellite/field-2-truecolor-2026-09-24.png"),
  "field-3-truecolor-2026-08-13.png": require("../../assets/satellite/field-3-truecolor-2026-08-13.png"),
  "field-3-truecolor-2026-09-24.png": require("../../assets/satellite/field-3-truecolor-2026-09-24.png"),
};

const RAW = {
 "field-1": {
  "latest": {
   "date": "2026-09-24",
   "ndvi": 0.712,
   "cloud_pct": 0
  },
  "series": [
   {
    "date": "2026-08-30",
    "ndvi": 0.716,
    "valid_pct": 83
   },
   {
    "date": "2026-09-04",
    "ndvi": 0.748,
    "valid_pct": 100
   },
   {
    "date": "2026-09-09",
    "ndvi": 0.745,
    "valid_pct": 100
   },
   {
    "date": "2026-09-14",
    "ndvi": 0.742,
    "valid_pct": 100
   },
   {
    "date": "2026-09-19",
    "ndvi": 0.694,
    "valid_pct": 100
   },
   {
    "date": "2026-09-24",
    "ndvi": 0.712,
    "valid_pct": 100
   }
  ],
  "images": [
   {
    "date": "2026-09-27",
    "file": "field-1-truecolor-2026-09-27.png",
    "cloudPct": 0
   },
   {
    "date": "2026-08-18",
    "file": "field-1-truecolor-2026-08-18.png",
    "cloudPct": 0
   }
  ],
  "bbox": [
   45.574077,
   41.954745,
   45.58081,
   41.95867
  ],
  "size": [
   56,
   44
  ]
 },
 "field-2": {
  "latest": {
   "date": "2026-09-24",
   "ndvi": 0.657,
   "cloud_pct": 0
  },
  "series": [
   {
    "date": "2026-08-25",
    "ndvi": 0.555,
    "valid_pct": 100
   },
   {
    "date": "2026-08-30",
    "ndvi": 0.631,
    "valid_pct": 100
   },
   {
    "date": "2026-09-04",
    "ndvi": 0.663,
    "valid_pct": 100
   },
   {
    "date": "2026-09-14",
    "ndvi": 0.661,
    "valid_pct": 100
   },
   {
    "date": "2026-09-19",
    "ndvi": 0.649,
    "valid_pct": 100
   },
   {
    "date": "2026-09-24",
    "ndvi": 0.657,
    "valid_pct": 100
   }
  ],
  "images": [
   {
    "date": "2026-09-24",
    "file": "field-2-truecolor-2026-09-24.png",
    "cloudPct": 0
   },
   {
    "date": "2026-08-13",
    "file": "field-2-truecolor-2026-08-13.png",
    "cloudPct": 0
   }
  ],
  "bbox": [
   45.828978,
   41.950916,
   45.835867,
   41.957862
  ],
  "size": [
   57,
   77
  ]
 },
 "field-3": {
  "latest": {
   "date": "2026-09-24",
   "ndvi": 0.663,
   "cloud_pct": 0
  },
  "series": [
   {
    "date": "2026-08-30",
    "ndvi": 0.752,
    "valid_pct": 100
   },
   {
    "date": "2026-09-04",
    "ndvi": 0.786,
    "valid_pct": 100
   },
   {
    "date": "2026-09-09",
    "ndvi": 0.738,
    "valid_pct": 100
   },
   {
    "date": "2026-09-14",
    "ndvi": 0.732,
    "valid_pct": 100
   },
   {
    "date": "2026-09-19",
    "ndvi": 0.644,
    "valid_pct": 100
   },
   {
    "date": "2026-09-24",
    "ndvi": 0.663,
    "valid_pct": 100
   }
  ],
  "images": [
   {
    "date": "2026-09-24",
    "file": "field-3-truecolor-2026-09-24.png",
    "cloudPct": 0
   },
   {
    "date": "2026-08-13",
    "file": "field-3-truecolor-2026-08-13.png",
    "cloudPct": 0
   }
  ],
  "bbox": [
   45.642529,
   42.009066,
   45.650619,
   42.013751
  ],
  "size": [
   67,
   52
  ]
 }
};

/** Health for a field id, or null when there is no satellite data (e.g. a field the farmer just drew). */
export function getFieldHealth(fieldId: string): FieldHealth | null {
  const r = (RAW as Record<string, (typeof RAW)["field-1"]>)[fieldId];
  if (!r) return null;
  return {
    latest: { date: r.latest.date, index: r.latest.ndvi, cloudPct: r.latest.cloud_pct },
    series: r.series.map((p) => ({ date: p.date, index: p.ndvi })),
    pictures: r.images.map((i) => ({ date: i.date, cloudPct: i.cloudPct, source: PICTURES[i.file] })),
    bbox: r.bbox as [number, number, number, number],
    size: r.size as [number, number],
  };
}

export function bandOf(index: number): HealthBand {
  return index < 0.35 ? "Poor" : index < 0.55 ? "Medium" : "Good";
}
