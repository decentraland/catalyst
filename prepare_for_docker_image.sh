set -e

commit_hash="$(git rev-parse HEAD)"

sed -i "s/COMMIT_HASH=.*/COMMIT_HASH=${commit_hash}/g" Dockerfile

# TODO: update version depending on whether we are running in master or semver tags
# sed -i "s/CATALYST_VERSION=.*/CATALYST_VERSION=${commit_hash}/g" Dockerfile
