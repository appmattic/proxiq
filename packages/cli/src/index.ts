#!/usr/bin/env bun
import { VERSION } from "@proxiq/core";
import { Command } from "commander";
import { registerCache } from "./commands/cache.js";
import { registerConfig } from "./commands/config.js";
import { registerStart } from "./commands/start.js";
import { registerStats } from "./commands/stats.js";
import { registerStatus } from "./commands/status.js";
import { registerStop } from "./commands/stop.js";

const program = new Command();

program
  .name("proxiq")
  .description("Proxiq — Intelligent LLM Gateway")
  .version(VERSION);

registerStart(program);
registerStop(program);
registerStatus(program);
registerStats(program);
registerCache(program);
registerConfig(program);

program.parse();
