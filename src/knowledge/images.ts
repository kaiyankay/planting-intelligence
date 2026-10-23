import imagesJson from "./plant-images.json";

// Openly licensed photographs from Wikimedia Commons, one per plant record, copied into
// public/plants/<id>.jpg at build time. Each entry keeps the licence, author and file page so
// the interface and docs/IMAGE-CREDITS.md can attribute them. A record without a photo falls
// back to a labelled illustration mark in the interface.
export interface PlantImage {
  id: string;
  species: string;
  file: string;
  page_url: string;
  license: string;
  license_url: string;
  author: string;
  local: string; // path under public/
}

export const PLANT_IMAGES: PlantImage[] = imagesJson as PlantImage[];

export function imageFor(id: string): PlantImage | undefined {
  return PLANT_IMAGES.find((i) => i.id === id);
}

export function imageSrc(img: PlantImage): string {
  return `${import.meta.env.BASE_URL}${img.local}`;
}
