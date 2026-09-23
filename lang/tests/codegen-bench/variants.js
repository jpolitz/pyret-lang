"use strict";

module.exports = [
  { name: "baseline", codegen: "" },
  { name: "no-al", codegen: "no-al" },
  { name: "no-gas", codegen: "no-gas" },
  { name: "gas-box", codegen: "gas-box" },
  { name: "gas-modvar", codegen: "gas-modvar" },
  { name: "fixnum", codegen: "fixnum" },
  { name: "sched-noyield", codegen: "", pauseSchedule: "schedules/noyield.js" },
  { name: "sched-nocapture", codegen: "", pauseSchedule: "schedules/nocapture.js" },
  { name: "all-ablations", codegen: "no-al,no-gas,fixnum", pauseSchedule: "schedules/nocapture.js" },
  { name: "direct", codegen: "direct", pauseSchedule: "schedules/nocapture.js" },
  { name: "direct-fixnum", codegen: "direct,fixnum", pauseSchedule: "schedules/nocapture.js" },
];
