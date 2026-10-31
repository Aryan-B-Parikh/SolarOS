/**
 * PM2 Production Process Supervisor Configuration for SolarOS
 * Reference: ADR D10 (Connection Pooling & Zero Microservices Overhead)
 */
module.exports = {
  apps: [
    {
      name: 'solaros-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
};

