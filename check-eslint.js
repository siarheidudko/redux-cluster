#!/usr/bin/env node
const { spawn } = require("child_process");

console.log("Starting ESLint check...");

const eslint = spawn("npx", ["eslint", "src/index.ts"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";

eslint.stdout.on("data", (data) => {
  stdout += data.toString();
});

eslint.stderr.on("data", (data) => {
  stderr += data.toString();
});

eslint.on("close", (code) => {
  console.log("ESLint exit code:", code);
  if (stdout) {
    console.log("STDOUT:", stdout);
  }
  if (stderr) {
    console.log("STDERR:", stderr);
  }
  process.exit(code);
});

// Kill after 10 seconds if not finished
setTimeout(() => {
  console.log("ESLint timeout, killing process");
  eslint.kill();
  process.exit(1);
}, 10000);
