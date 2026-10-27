import { readFile, writeFile } from "node:fs/promises";

const tag = process.env.RELEASE_TAG?.trim();
const output = process.argv[2] ?? "deploy/rendered-openshift-planeo.yaml";
if (!tag || tag === "latest" || !/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(tag)) {
  throw new Error("RELEASE_TAG must be an explicit immutable image tag and cannot be latest.");
}
const source = await readFile("deploy/openshift-planeo.yaml", "utf8");
const rendered = source.replaceAll(":release-placeholder", `:${tag}`);
if (rendered.includes(":release-placeholder") || /image:.*:latest\s*$/.test(rendered)) throw new Error("Rendered manifest still contains a mutable or unresolved image tag.");
await writeFile(output, rendered);
console.log(`Rendered ${output} with release tag ${tag}.`);
