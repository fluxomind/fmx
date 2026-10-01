#!/usr/bin/env node
// Version probes must not load the command graph or read authentication state.
import { VERSION } from './version';
const args = process.argv.slice(2);
if (args.length === 1 && ['--version', '-v', '-V'].includes(args[0])) {
  console.log(VERSION);
} else {
  void import('./cli');
}
