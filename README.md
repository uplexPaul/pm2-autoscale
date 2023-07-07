# PM2-Autoscale [![npm version](https://badge.fury.io/js/pm2-autoscale.svg)](https://www.npmjs.com/package/pm2-autoscale)

PM2 is a module that helps dynamically scale applications based on utilization demand.

## Motivation

By default, PM2 runs the application with a specified number of instances, which is not suitable when you have a few applications on one server with many CPUs, and you cannot predict which application will load your server. For example, if you have 48 CPUs and you run the application with instances=max, PM2 will run 48 instances, and every instance usually uses at least 100Mb of memory (~5GB for all instances). So, if you have 10 applications, it means you will use about 50GB of server memory without server load.

## Solution

The module helps dynamically increase application instances depending on CPU utilization of every application. You can run your application with the minimum required instances. When the module detects that CPU utilization is higher than scale_cpu_threshold, it will start increasing instances to a maximum of CPUs-1, provided that the server has available free memory. When the module detects that CPU utilization is decreasing, it will stop the unnecessary instances.

## Install

```bash
pm2 install pm2-autoscale
```

## Uninstall

```bash
pm2 uninstall pm2-autoscale
```

## Configuration

Default settings:

-   `scale_cpu_threshold` Maximum value of CPU utilization one of application instances when the module will try to increase application instances. (default to `30`)
-   `release_cpu_threshold` Average value of all CPUs utilization of the application when the module will decrease application instances (default to `5`)
-   `debug` Enable debug mode to show logs from the module (default to `false`)

To modify the module config values you can use the following commands:

```bash
pm2 set pm2-autoscale:debug true
pm2 set pm2-autoscale:scale_cpu_threshold 50
```
