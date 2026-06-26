import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve("distribution");
const tsconfigPath = resolve("tsconfig.build.json");

function clean()
{
    rmSync(outputDirectory, { recursive: true, force: true });
}

function compile()
{
    execSync(`tsc -p "${tsconfigPath}"`, { stdio: "inherit" });
}

clean();
compile();
