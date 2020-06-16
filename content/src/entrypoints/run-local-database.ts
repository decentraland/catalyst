import { exec } from 'child_process';
import { DEFAULT_DATABASE_CONFIG } from '../Environment';

exec(`
    docker rm -f postgres ; \
    docker run \
    --name postgres \
    -e POSTGRES_PASSWORD=${DEFAULT_DATABASE_CONFIG.password} \
    -e POSTGRES_USER=${DEFAULT_DATABASE_CONFIG.user} \
    -e POSTGRES_DB=${DEFAULT_DATABASE_CONFIG.database} \
    -p ${DEFAULT_DATABASE_CONFIG.port}:5432 \
    -v psql-vol:/var/lib/postgresql/data \
    -d postgres`,
    (error, stdout, stderr) => {
        console.log("ERROR", error)
        console.log("STDOUT", stdout)
        console.log("STDERR", stderr)
    })