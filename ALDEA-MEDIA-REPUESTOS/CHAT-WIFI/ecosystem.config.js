module.exports = {
    apps: [
        {
            name: 'wifi-backend',
            script: 'src/index.js',
            cwd: './backend',
            instances: 1,
            autorestart: true,
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            },
            exp_backoff_restart_delay: 100,
            error_file: 'logs/err.log',
            out_file: 'logs/out.log'
        }
    ]
};
