import { exampleAssetUrl } from "../utils/exampleAssets";

export interface DrawingExample {
  id: string;
  name: string;
  partType: string;
  inputDrawing: string;
  /** Relative path under wondercad/example/ */
  relativePath: string;
  defaultPrompt: string;
}

export interface ExampleFolder {
  id: string;
  name: string;
  childIds: string[];
}

export interface CustomDrawingEntry {
  id: string;
  name: string;
  partType: string;
  inputDrawing: string;
  /** In-memory preview only; not persisted. */
  imageDataUrl?: string;
  /** Filename under .wondercad-storage/imports/ */
  imageFile?: string;
  mimeType: string;
  createdAt: string;
  defaultPrompt: string;
}

export const IMPORTED_FOLDER_ID = "folder_imported";
export const FOLDER_OTHER_EXAMPLES_ID = "folder_other_examples";
export const FOLDER_TIER_EXAMPLES_ID = "folder_tier_examples";

export const DEFAULT_DRAWING_ONLY_PROMPT =
  "Reconstruct the 3D CAD model from the reference engineering drawing. Match visible dimensions, features, and overall geometry.";

function drawingExample(
  id: string,
  name: string,
  partType: string,
  inputDrawing: string,
  relativePath: string
): DrawingExample {
  return { id, name, partType, inputDrawing, relativePath, defaultPrompt: "" };
}

const OTHER_DRAWING_EXAMPLES: DrawingExample[] = [
  drawingExample(
    "example_cbp_s14_12",
    "CBP Practice S14-12",
    "Machined Part",
    "s14-12.png",
    "cbp-05062026-cad-3d-practice-1.snapshot.5/drawings/s14-12.png"
  ),
  drawingExample(
    "example_conductor_s14_13",
    "Conductor Bushing S14-13",
    "Bushing",
    "s14-13.png",
    "conductor-bushing-cbp-12062026-cad-3d-practice-1.snapshot.3/drawings/s14-13.png"
  ),
  drawingExample(
    "example_ejercicio_05",
    "Ejercicio 05 Onshape",
    "Practice Part",
    "photo_2025-07-13_15-27-55.jpg",
    "ejercicio-05-onshape-2.snapshot.1/photo_2025-07-13_15-27-55.jpg"
  ),
  drawingExample(
    "example_ejercicio_305",
    "Ejercicio 305 Onshape",
    "Practice Part",
    "EJERCICIO 305 ONSHAPE.png",
    "ejercicio-305-onshape-1.snapshot.1/EJERCICIO 305 ONSHAPE.png"
  ),
  drawingExample(
    "example_shoulder_spacer",
    "Shoulder Spacer",
    "Machined Part",
    "shoulder_spacer.png",
    "shoulder_spacer.png"
  ),
  drawingExample(
    "example_clamp_base_spacer",
    "Clamp Base Spacer",
    "Machined Part",
    "clamp_base_spacer.png",
    "clamp_base_spacer.png"
  ),
  drawingExample(
    "example_clamp_base_support",
    "Clamp Base Support",
    "Machined Part",
    "clamp_base_support.jpg",
    "clamp_base_support.jpg"
  ),
];

const TIER_DRAWING_EXAMPLES: DrawingExample[] = [
  drawingExample(
    "example_tier01_phone_stand_1",
    "Tier01 Phone Stand 1",
    "Tier 01",
    "Tier01_PHONE_STAND_1.png",
    "Tier01_PHONE_STAND_1.png"
  ),
  drawingExample(
    "example_tier01_small_hollow_box",
    "Tier01 Small Hollow Box",
    "Tier 01",
    "Tier01_SMALL_HOLLOW_BOX.png",
    "Tier01_SMALL_HOLLOW_BOX.png"
  ),
  drawingExample(
    "example_tier01_tier_1_part",
    "Tier01 Tier 1 Part",
    "Tier 01",
    "Tier01_TIER_1_PART.png",
    "Tier01_TIER_1_PART.png"
  ),
  drawingExample(
    "example_tier02_cover",
    "Tier02 Cover",
    "Tier 02",
    "Tier02_COVER.png",
    "Tier02_COVER.png"
  ),
  drawingExample(
    "example_tier02_soap_dish_shelf",
    "Tier02 Soap Dish Shelf",
    "Tier 02",
    "Tier02_SOAP_DISH_SHELF.png",
    "Tier02_SOAP_DISH_SHELF.png"
  ),
  drawingExample(
    "example_tier03_hollow_sphere_pyramid",
    "Tier03 Hollow Sphere Pyramid",
    "Tier 03",
    "Tier03_Hollow_Sphere_Pyramid.png",
    "Tier03_Hollow_Sphere_Pyramid.png"
  ),
  drawingExample(
    "example_tier04_hand_wheel_for_valvue",
    "Tier04 Hand Wheel for Valve",
    "Tier 04",
    "Tier04_HAND_WHEEL_for_VALVUE.png",
    "Tier04_HAND_WHEEL_for_VALVUE.png"
  ),
  drawingExample(
    "example_tier04_umbrella_hook",
    "Tier04 Umbrella Hook",
    "Tier 04",
    "Tier04_UMBRELLA_HOOK.png",
    "Tier04_UMBRELLA_HOOK.png"
  ),
  drawingExample(
    "example_tier04_usb_wall_charger",
    "Tier04 USB Wall Charger",
    "Tier 04",
    "Tier04_USB_WALL_CHARGER.png",
    "Tier04_USB_WALL_CHARGER.png"
  ),
  drawingExample(
    "example_tier05_soap_dish_base",
    "Tier05 Soap Dish Base",
    "Tier 05",
    "Tier05_SOAP_DISH_BASE.png",
    "Tier05_SOAP_DISH_BASE.png"
  ),
  drawingExample(
    "example_tier06_triangle_wire_shelf",
    "Tier06 Triangle Wire Shelf",
    "Tier 06",
    "Tier06_TRIANGLE_WIRE_SHELF.png",
    "Tier06_TRIANGLE_WIRE_SHELF.png"
  ),
  drawingExample(
    "example_tier06_universal_bracket",
    "Tier06 Universal Bracket",
    "Tier 06",
    "Tier06_UNIVERSAL_BRACKET.png",
    "Tier06_UNIVERSAL_BRACKET.png"
  ),
];

export const DRAWING_EXAMPLES: DrawingExample[] = [
  ...OTHER_DRAWING_EXAMPLES,
  ...TIER_DRAWING_EXAMPLES,
];

export function effectiveGeneratePrompt(prompt: string, hasDrawing: boolean): string {
  const trimmed = prompt.trim();
  if (trimmed) return trimmed;
  return hasDrawing ? DEFAULT_DRAWING_ONLY_PROMPT : "";
}

export function folderIdForExample(exampleId: string): string {
  return exampleId.startsWith("example_tier")
    ? FOLDER_TIER_EXAMPLES_ID
    : FOLDER_OTHER_EXAMPLES_ID;
}

export const DEFAULT_EXAMPLE_FOLDERS: ExampleFolder[] = [
  {
    id: IMPORTED_FOLDER_ID,
    name: "Imported",
    childIds: [],
  },
  {
    id: FOLDER_TIER_EXAMPLES_ID,
    name: "tier_examples",
    childIds: TIER_DRAWING_EXAMPLES.map((e) => e.id),
  },
  {
    id: FOLDER_OTHER_EXAMPLES_ID,
    name: "other_examples",
    childIds: OTHER_DRAWING_EXAMPLES.map((e) => e.id),
  },
];

export interface ResolvedDrawingExample extends DrawingExample {
  imageUrl: string;
}

export function resolveExample(
  example: DrawingExample,
  pathOverrides: Record<string, string> = {}
): ResolvedDrawingExample {
  const relativePath = pathOverrides[example.id] ?? example.relativePath;
  return {
    ...example,
    relativePath,
    imageUrl: exampleAssetUrl(relativePath),
  };
}

export function resolveCustomEntry(entry: CustomDrawingEntry): ResolvedDrawingExample {
  const imageUrl =
    entry.imageDataUrl ||
    (entry.imageFile ? `/api/storage/imports/${encodeURIComponent(entry.imageFile)}` : "");
  return {
    id: entry.id,
    name: entry.name,
    partType: entry.partType,
    inputDrawing: entry.inputDrawing,
    relativePath: `imported://${entry.id}`,
    defaultPrompt: entry.defaultPrompt,
    imageUrl,
  };
}

export function resolveLibraryExamples(
  pathOverrides: Record<string, string> = {},
  customEntries: CustomDrawingEntry[] = []
): ResolvedDrawingExample[] {
  return [
    ...DRAWING_EXAMPLES.map((ex) => resolveExample(ex, pathOverrides)),
    ...customEntries.map(resolveCustomEntry),
  ];
}

export function resolveAllExamples(
  pathOverrides: Record<string, string> = {}
): ResolvedDrawingExample[] {
  return resolveLibraryExamples(pathOverrides, []);
}
