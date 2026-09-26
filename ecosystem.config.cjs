module.exports = {
  apps: [
    {
      name: 'pactra-api',
      script: './backend/start-server.sh',
      cwd: '/root/Pactra/backend',
      env: {},
      // .env.local is loaded by the wrapper below
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
    {
      name: 'pactra-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --hostname 127.0.0.1 -p 3001',
      cwd: '/root/Pactra/frontend',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
