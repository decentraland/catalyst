#!/bin/bash
PROGNAME=$0

####
# Functions
#####
usage() {
  cat << EOF >&2
Usage: $PROGNAME [-v] [-d <dir>] [-f <file>]
-f <file>: ...
 -d <dir>: ...
       -v: ...
EOF
  exit 1
}

leCertEmit () {
  if ! [ -x "$(command -v docker-compose)" ]; then
    echo 'Error: docker-compose is not installed.' >&2
    exit 1
  fi

  domains=(katalyst-nginx.decentraland.zone katalyst-comms-relay.decentraland.zone katalyst-content.decentraland.zone katalyst-lambdas.decentraland.zone)
  rsa_key_size=4096
  data_path="./local/certbot"
  email="alejandro@decentraland.zone" # Adding a valid address is strongly recommended
  #if test -z staging; then
    echo "## requeting a staging certificate"
    staging=1 # Set to 1 if you're testing your setup to avoid hitting request limits
  #fi
  if [ -d "$data_path" ]; then
    read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
    if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
      return 0
    fi
  fi


  if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
    echo "### Downloading recommended TLS parameters ..."
    mkdir -p "$data_path/conf"
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
    echo
  fi

  echo "### Creating dummy certificate for $domains ..."
  path="/etc/letsencrypt/live/$domains"
  mkdir -p "$data_path/conf/live/$domains"
  docker-compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:1024 -days 1\
      -keyout '$path/privkey.pem' \
      -out '$path/fullchain.pem' \
      -subj '/CN=localhost'" certbot
  echo


  echo "### Starting nginx ..."
  docker-compose up --force-recreate -d nginx
  echo

  echo "### Deleting dummy certificate for $domains ..."
  docker-compose run --rm --entrypoint "\
    rm -Rf /etc/letsencrypt/live/$domains && \
    rm -Rf /etc/letsencrypt/archive/$domains && \
    rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
  echo


  echo "### Requesting Let's Encrypt certificate for $domains ..."
  #Join $domains to -d args
  domain_args=""
  for domain in "${domains[@]}"; do
    domain_args="$domain_args -d $domain"
  done

  # Select appropriate email arg
  case "$email" in
    "") email_arg="--register-unsafely-without-email" ;;
    *) email_arg="--email $email" ;;
  esac

  # Enable staging mode if needed
  if [ $staging != "0" ]; then staging_arg="--staging"; fi

  docker-compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
      $staging_arg \
      $email_arg \
      $domain_args \
      --rsa-key-size $rsa_key_size \
      --agree-tos \
      --force-renewal" certbot
  echo

  echo "### Reloading nginx ..."
  docker-compose exec nginx nginx -s reload
}

#####
# Main
#####
#staging=1
#while getopts s:d o; do
#  case $o in
#    (s) staging=${OPTARG};;
#    (d) domain=
#    (*) usage
#  esac
#done
#shift "$((OPTIND - 1))"

leCertEmit
echo "### Restarting containers to reload the new certs..."
docker-compose stop 
docker-compose up -d
