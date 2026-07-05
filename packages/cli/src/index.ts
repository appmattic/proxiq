#!/usr/bin/env bun
import { Command } from "commander";
import { VERSION } from "@proxiq/core";
import { registerStart } from "./commands/start.js";
import { registerStop } from "./commands/stop.js";
import { registerStatus } from "./commands/status.js";
import { registerStats } from "./commands/stats.js";
import { registerCache } from "./commands/cache.js";
import { registerConfig } from "./commands/config.js";

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
