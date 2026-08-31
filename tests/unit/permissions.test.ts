import { describe, expect, it } from "vitest";
import { matchesIssueSecurity, PROJECT_PERMISSIONS, validatePermissions, validateSecurityGrants } from "@/lib/permissions";

describe("permission policy validation", () => {
  it("requires every capability to be explicitly defined", () => {
    expect(() => validatePermissions({ "issue.view": ["WORKSPACE:MEMBER"] })).toThrow("Explicit grants");
    expect(validatePermissions(Object.fromEntries(PROJECT_PERMISSIONS.map(action => [action, []])))).toEqual(Object.fromEntries(PROJECT_PERMISSIONS.map(action => [action, []])));
  });
  it("rejects unknown principals and empty issue-security levels", () => {
    expect(() => validatePermissions(Object.fromEntries(PROJECT_PERMISSIONS.map(action => [action, action === "issue.view" ? ["EVERYONE"] : []])))).toThrow("issue.view");
    expect(() => validateSecurityGrants({})).toThrow("at least one principal");
    expect(validateSecurityGrants({ reporter: true, userIds: ["u1", "u1"] })).toEqual({ reporter: true, userIds: ["u1"] });
  });
  it("does not notify an actor outside the issue security level", () => {
    const issue = { reporterId: "reporter", assigneeId: null };
    expect(matchesIssueSecurity({ userIds: ["allowed"] }, { userId: "denied", workspaceRole: "OWNER" }, issue)).toBe(false);
    expect(matchesIssueSecurity({ groupIds: ["g1"] }, { userId: "member", workspaceRole: "MEMBER", groupIds: ["g1"] }, issue)).toBe(true);
  });
});
