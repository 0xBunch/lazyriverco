import type { $Enums } from "@prisma/client";

// Human label for a MediaOrigin. Used across grid filters, detail eyebrow,
// and filter-sheet chip picker. Keeping it in one place so the displayed
// strings stay consistent (the "Uploads" / "Uploaded" split between pages
// the simplicity review flagged disappears here).
//
// Not exhaustive-cased via a `never` default on purpose — the Prisma
// enum is the source of truth, so adding a new origin value will cause
// every call site whose `switch` doesn't default-label to fail type-check.

export function originLabel(o: $Enums.MediaOrigin): string {
  switch (o) {
    case "UPLOAD":
      return "Uploads";
    case "YOUTUBE":
      return "YouTube";
    case "INSTAGRAM":
      return "Instagram";
    case "X":
      return "X";
    case "WEB":
      return "Web";
  }
}
