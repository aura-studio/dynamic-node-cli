import { Cleaner } from "./cleaner.js";
import { newPathListForProcedure } from "./path-list.js";

export function cleanForProcedure(proc, type) {
  const pathList = newPathListForProcedure(proc);
  const cleaner = new Cleaner(pathList);
  return cleaner.clean(type);
}
