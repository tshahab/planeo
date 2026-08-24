import { describe,expect,it } from "vitest";
import { normalizeSavedQuery } from "@/lib/saved-filter";
describe("saved filter validation",()=>{it("normalizes supported filters",()=>expect(normalizeSavedQuery({q:" roadmap ",priority:"HIGH"})).toEqual({q:"roadmap",priority:"HIGH"}));it("rejects unknown and non-string values",()=>{expect(normalizeSavedQuery({workspaceId:"escape"})).toBeNull();expect(normalizeSavedQuery({q:7})).toBeNull()})});
