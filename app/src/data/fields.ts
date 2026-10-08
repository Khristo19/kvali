// ONE source of field outlines for the whole app. Swap `DEMO_FIELDS` for another list here and
// nothing else needs to change. The data below is copied from ~/kvali/data/demo-fields.geojson (task r04):
// three real vineyard outlines in Kakheti from OpenStreetMap (ODbL), so the app bundle does not import
// from outside app/. Coordinates are [lon, lat] (GeoJSON order), ring NOT closed.
import { areaCha, centroidOf, outlineHash, type LonLat } from "@/geo/geo";

export type FieldSource = "drawn" | "registry";

export interface Field {
  id: string;
  name: string;
  /** Short crop name for cards, e.g. "Grapes". */
  crop: string;
  /** Short product name for cards, e.g. "Copper fungicide". */
  product: string;
  outline: LonLat[];
  /** "registry" = boundary from the land registry (shows "Verified boundary"). Nothing fetches this yet. */
  source: FieldSource;
  /** Where an imported outline came from, if not drawn in the app. */
  origin?: string;
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

export const DEMO_FIELDS: Field[] = [
  {
    id: "field-1",
    name: "Vineyard near Kondoli",
    crop: "Grapes",
    product: "Copper fungicide",
    source: "drawn",
    origin: "OpenStreetMap way 866085848, ODbL",
    outline: [
      [45.575277, 41.957635],
      [45.574802, 41.955924],
      [45.577407, 41.955403],
      [45.577607, 41.955648],
      [45.579254, 41.955284],
      [45.580085, 41.95748],
      [45.57679, 41.958131],
      [45.576538, 41.957381],
    ],
  },
  {
    id: "field-2",
    name: "Vineyard near Kvareli",
    crop: "Grapes",
    product: "Copper fungicide",
    source: "drawn",
    origin: "OpenStreetMap way 871646542, ODbL",
    outline: [
      [45.831428, 41.957323],
      [45.830751, 41.955597],
      [45.83078, 41.955399],
      [45.830658, 41.955218],
      [45.829957, 41.954163],
      [45.829703, 41.95353],
      [45.829726, 41.95291],
      [45.831017, 41.952303],
      [45.830988, 41.951963],
      [45.832227, 41.951455],
      [45.832382, 41.951852],
      [45.83302, 41.953491],
      [45.833803, 41.953343],
      [45.834045, 41.953298],
      [45.835142, 41.956158],
      [45.834056, 41.956604],
      [45.832864, 41.956975],
    ],
  },
  {
    id: "field-3",
    name: "Vineyard near Gremi",
    crop: "Grapes",
    product: "Copper fungicide",
    source: "drawn",
    origin: "OpenStreetMap way 878363717, ODbL",
    outline: [
      [45.643367, 42.013212],
      [45.643254, 42.011466],
      [45.645703, 42.010762],
      [45.645958, 42.010015],
      [45.647261, 42.009657],
      [45.647685, 42.009657],
      [45.648223, 42.009762],
      [45.649894, 42.009605],
      [45.649865, 42.011361],
      [45.648719, 42.011519],
      [45.645774, 42.012392],
    ],
  },
];

/** Where the map opens for a new drawing: centre of the default (first) demo field. */
export const DEFAULT_CENTER: LonLat = centroidOf(DEMO_FIELDS[0].outline);
export const DEFAULT_OUTLINE: LonLat[] = DEMO_FIELDS[0].outline;

export function fieldHa(f: Field): number {
  return areaCha(f.outline) / 100;
}

export function fieldHash(f: Field): string {
  return outlineHash(f.outline);
}
