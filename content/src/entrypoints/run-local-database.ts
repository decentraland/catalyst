import { exec } from 'child_process';

export const DEFAULT_DATABASE_CONFIG = {
    password: '12345678',
    user: 'postgres',
    database: 'content',
}

exec(`docker run
    --name postgres
    -e POSTGRES_PASSWORD=${DEFAULT_DATABASE_CONFIG.password}
    -e POSTGRES_USER=${DEFAULT_DATABASE_CONFIG.user}
    -e POSTGRES_DB=${DEFAULT_DATABASE_CONFIG.database}
    -d postgres`)