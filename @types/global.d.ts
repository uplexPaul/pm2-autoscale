type IConfig = {
  average_worker_resources_over_seconds: number;
  debug: boolean;
  max_workers: number;
  min_seconds_to_add_worker: number;
  min_seconds_to_release_worker: number;
  release_cpu_threshold: number;
  scale_cpu_threshold: number;
};

type IPMXConfig = {
  module_conf: IConfig;
};
