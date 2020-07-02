set -e

commit_hash=`git rev-parse HEAD`

sed -i "s/COMMIT_HASH=.*/COMMIT_HASH=$commit_hash/g" Dockerfile
