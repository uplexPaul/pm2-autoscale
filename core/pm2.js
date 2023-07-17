"use strict";
/// <reference path="../@types/global.d.ts" />
/// <reference path="../@types/pm2.d.ts" />
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPm2Connect = void 0;
const pm2_1 = __importDefault(require("pm2"));
const node_os_1 = __importDefault(require("node:os"));
const app_1 = require("./app");
const utils_1 = require("../utils");
const logger_1 = require("../utils/logger");
const WORKER_CHECK_INTERVAL = 1000;
const SHOW_STAT_INTERVAL = 10000;
const MEMORY_MB = 1048576;
const TOTAL_CPUS = node_os_1.default.cpus().length;
const DEFAULT_MAX_AVAILABLE_WORKERS_COUNT = TOTAL_CPUS - 1;
const APPS = {};
const startPm2Connect = (conf) => {
    pm2_1.default.connect((err) => {
        if (err)
            return console.error(err.stack || err);
        setInterval(() => {
            pm2_1.default.list((err, apps) => {
                if (err)
                    return console.error(err.stack || err);
                const allAppsPids = {};
                apps.forEach((app) => {
                    if (!app.name || !app.pid) {
                        return;
                    }
                    // Fill all apps pids
                    if (!allAppsPids[app.name]) {
                        allAppsPids[app.name] = [];
                    }
                    allAppsPids[app.name].push(app.pid);
                });
                Object.keys(APPS).forEach((appName) => {
                    if (!allAppsPids[appName]) {
                        // Delete app if not longer exists
                        delete APPS[appName];
                    }
                });
                apps.forEach((app) => {
                    var _a, _b;
                    const pm2_env = app.pm2_env;
                    if (pm2_env.axm_options.isModule) {
                        return;
                    }
                    if (pm2_env.exec_mode === "fork_mode") {
                        return;
                    }
                    if (!app.name || !app.pid || app.pm_id === undefined) {
                        return;
                    }
                    if (pm2_env.status !== "online") {
                        delete APPS[app.name];
                        return;
                    }
                    if (!APPS[app.name]) {
                        APPS[app.name] = new app_1.App(app.name, pm2_env.instances);
                    }
                    const workingApp = APPS[app.name];
                    const activePids = allAppsPids[app.name];
                    if (activePids) {
                        workingApp.removeNotActivePids(activePids);
                    }
                    workingApp.updatePid(conf, {
                        id: app.pid,
                        memory: Math.round((((_a = app.monit) === null || _a === void 0 ? void 0 : _a.memory) || 0) / MEMORY_MB),
                        cpu: ((_b = app.monit) === null || _b === void 0 ? void 0 : _b.cpu) || 0,
                        pmId: app.pm_id,
                    });
                    processWorkingApp(conf, workingApp);
                });
            });
        }, WORKER_CHECK_INTERVAL);
        if (conf.debug) {
            setInterval(() => {
                (0, logger_1.getLogger)().debug(`System: Free memory ${(0, utils_1.handleUnit)(node_os_1.default.freemem())}, Total memory: ${(0, utils_1.handleUnit)(node_os_1.default.totalmem())}`);
                if (Object.keys(APPS).length) {
                    for (const [, app] of Object.entries(APPS)) {
                        (0, logger_1.getLogger)().debug(`App "${app.getName()}" has ${app.getActiveWorkersCount()} worker(s). CPU: ${app.getCpuThreshold()}, Memory: ${app.getTotalUsedMemory()}MB`);
                    }
                }
                else {
                    (0, logger_1.getLogger)().debug(`No apps available`);
                }
            }, SHOW_STAT_INTERVAL);
        }
    });
};
exports.startPm2Connect = startPm2Connect;
function processWorkingApp(conf, workingApp) {
    if (workingApp.isProcessing) {
        (0, logger_1.getLogger)().debug(`App "${workingApp.getName()}" is busy`);
        return;
    }
    const cpuValues = [...workingApp.getCpuThreshold()];
    const cpuValuesSum = cpuValues.reduce((sum, value) => sum + value);
    const maxCpuValue = Math.max(...workingApp.getCpuThreshold());
    const averageCpuValue = Math.round(cpuValuesSum / cpuValues.length);
    (0, logger_1.getLogger)().debug(`cpuValuesSum: "${cpuValuesSum}"`);
    (0, logger_1.getLogger)().debug(`maxCpuValue: "${maxCpuValue}"`);
    (0, logger_1.getLogger)().debug(`averageCpuValue: "${averageCpuValue}"`);
    const needIncreaseInstances = 
    // Increase workers if any of CPUs loaded more then "scale_cpu_threshold"
    maxCpuValue >= conf.scale_cpu_threshold &&
        // Increase workers only if we have available CPUs for that
        workingApp.getActiveWorkersCount() <
            (conf.max_workers > 0
                ? conf.max_workers
                : DEFAULT_MAX_AVAILABLE_WORKERS_COUNT);
    if (needIncreaseInstances) {
        const freeMem = Math.round(node_os_1.default.freemem() / MEMORY_MB);
        const avgAppUseMemory = workingApp.getAverageUsedMemory();
        // Spawn enough workers to get the average CPU utilization below the threshold.
        const workersToSpawn = Math.min(Math.ceil(averageCpuValue / conf.scale_cpu_threshold *
            workingApp.getActiveWorkersCount() -
            workingApp.getActiveWorkersCount()), 
        // Never spawn more than we have memory for
        Math.floor(freeMem / avgAppUseMemory));
        // Sanity check
        const memoryAfterNewWorker = freeMem - avgAppUseMemory * workersToSpawn;
        if (memoryAfterNewWorker <= 0 || workersToSpawn === 0) {
            // Increase workers only if we have enough free memory
            (0, logger_1.getLogger)().debug(`Not enough memory to increase worker for app "${workingApp.getName()}". Free memory ${freeMem}MB, App average memeory ${avgAppUseMemory}MB `);
            return;
        }
        const now = Number(new Date());
        const secondsDiff = Math.round((now - workingApp.getLastIncreaseWorkersTime()) / 1000);
        if (secondsDiff > conf.min_seconds_to_add_worker) {
            // Add small delay between increasing workers to detect load
            (0, logger_1.getLogger)().debug(`Increase workers for app "${workingApp.getName()}"`);
            workingApp.isProcessing = true;
            pm2_1.default.scale(workingApp.getName(), `+${workersToSpawn}`, () => {
                workingApp.updateLastIncreaseWorkersTime();
                workingApp.isProcessing = false;
                (0, logger_1.getLogger)().info(`App "${workingApp.getName()}" scaled with +${workersToSpawn} worker`);
            });
        }
    }
    else {
        if (
        // Decrease workers if average CPUs load less then "release_cpu_threshold"
        averageCpuValue < conf.release_cpu_threshold &&
            // Process only if we have more workers than default value
            workingApp.getActiveWorkersCount() > workingApp.getDefaultWorkersCount()) {
            const now = Number(new Date());
            const secondsDiff = Math.round((now - workingApp.getLastDecreaseWorkersTime()) / 1000);
            if (secondsDiff > conf.min_seconds_to_release_worker) {
                (0, logger_1.getLogger)().debug(`Decrease workers for app "${workingApp.getName()}"`);
                const newWorkers = workingApp.getActiveWorkersCount() - 1;
                workingApp.isProcessing = true;
                if (newWorkers >= workingApp.getDefaultWorkersCount()) {
                    pm2_1.default.scale(workingApp.getName(), newWorkers, () => {
                        workingApp.updateLastDecreaseWorkersTime();
                        workingApp.isProcessing = false;
                        (0, logger_1.getLogger)().info(`App "${workingApp.getName()}" decreased one worker`);
                    });
                }
            }
        }
    }
}
