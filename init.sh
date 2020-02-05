#!/bin/bash
Source=".default_env"


####
# Functions
#####

leCertEmit () {
  if [ ! -e "$data_path/conf/options-ssl-nginx.conf" ] || [ ! -e "$data_path/conf/ssl-dhparams.pem" ]; then
    echo "## Downloading recommended TLS parameters ..."
    mkdir -p "$data_path/conf"
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "$data_path/conf/options-ssl-nginx.conf"
    curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "$data_path/conf/ssl-dhparams.pem"
    echo
  fi

  echo " Creating dummy certificate for $domains ..."
  path="/etc/letsencrypt/live/$domains"
  mkdir -p "$data_path/conf/live/$domains"
  docker-compose run --rm --entrypoint "\
    openssl req -x509 -nodes -newkey rsa:1024 -days 1\
      -keyout '$path/privkey.pem' \
      -out '$path/fullchain.pem' \
      -subj '/CN=localhost'" certbot
  echo


  echo -n "## Starting nginx ..."
  docker-compose up --force-recreate -d nginx
  echo

  if test $? -ne 0; then
    echo -n "Failed to start nginx...  " 
    printMessage failed
    exit 1
  else 
    echo -n "## Dummy certificates created ..."
    printMessage ok
  fi

  echo -n "## Deleting dummy certificate for $domains ..."
  docker-compose run --rm --entrypoint "\
    rm -Rf /etc/letsencrypt/live/$domains && \
    rm -Rf /etc/letsencrypt/archive/$domains && \
    rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
  echo

  if test $? -ne 0; then
    echo -n "Failed to remove files..." 
    printMessage failed
    exit 1
  else 
    echo -n "## files deleted ..."
    printMessage ok
  fi

  echo "## Requesting Let's Encrypt certificate for $domains ..."
  domain_args=""
  domain_args="$domain_args -d $domains"
  
  # Select appropriate email arg
  case "$email" in
    "") email_arg="--register-unsafely-without-email" ;;
    *) email_arg="--email $email" ;;
  esac

  docker-compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
      --staging \
      $email_arg \
      $domain_args \
      --rsa-key-size $rsa_key_size \
      --agree-tos \
      --force-renewal" certbot

  if test $? -ne 0; then
    echo -n "Failed to request certificates. Handshake failed?, the URL is pointing to this server?: " 
    printMessage failed
    exit 1
  else 
    echo -n "## Certificates requested..."
    printMessage ok
  fi

  #  docker-compose run --rm --entrypoint "\
  #  certbot certonly --webroot -w /var/www/certbot \
  #    $email_arg \
  #    $domain_args \
  #    --rsa-key-size $rsa_key_size \
  #    --agree-tos \
  #    --force-renewal" certbot

  #if test $? -ne 0; then
  #  echo -n "Failed to request certificates. Handshake failed?, the URL is pointing to this server?: " 
  #  printMessage failed
  #  exit 1
  #else 
  #  printMessage ok
  #fi


  echo "## Reloading nginx ..."
  docker-compose exec nginx nginx -s reload

  if test $? -ne 0; then
    echo -n "Failed to reload nginx " 
    printMessage failed
    exit 1
  else 
    printMessage ok
  fi
}

printMessage () {
    Type=$1
    case ${Type} in
      ok) echo -e "[\e[92m OK \e[39m]" ;;
      failed) echo -e "[\e[91m FAILED \e[39m]" ;;
      *) echo "";;
    esac
}

##
# Main program
##
clear
echo -n "## Loading env variables. If you placed more env variables, than the default shall not be shown:...   "
. ${Source}
if test $? -ne 0; then
  printMessage failed
  echo "Failed to load ${Source}. Name?, permissions?"
  exit 1
fi
printMessage ok
echo -n " - regenerate:            " ; echo -e "\e[33m ${regenerate} \e[39m"
echo -n " - domains:            " ; echo -e "[ \e[33m ${domains} \e[39m ]"
echo -n " - email:              " ; echo -e "\e[33m ${email} \e[39m"
echo -n " - rsa_key_size:       " ; echo -e "\e[33m ${rsa_key_size} \e[39m"
echo -n " - data_path:          " ; echo -e "\e[33m ${data_path} \e[39m"
echo -n " - nginx_server_file:  " ; echo -e "\e[33m ${nginx_server_file} \e[39m"
echo -n " - nginx_server_template:  " ; echo -e "\e[33m ${nginx_server_file} \e[39m"
echo -n " - content_server_storage:  " ; echo -e "\e[33m ${content_server_storage} \e[39m"
echo ""
read -rp "Enter to continue, CTRL+C to abort... " dummy

if ! [ -x "$(command -v docker-compose)" ]; then
  echo -n "Error: docker-compose is not installed..." >&2
  printMessage failed
  exit 1
fi
docker-compose stop
docker-compose rm

echo -n "## Checking if local storage folder is reachable..."
if test -d ${content_server_storage}; then
  printMessage ok
else
  echo  "## Not reachable. Creating one for you..."
    mkdir -p ${content_server_storage}
    if test $? -ne 0; then
      echo -n "Failed to create local storage folder." 
      printMessage failed
      exit 1
    fi
    echo -n "Folder ${content_server_storage} created..."
    printMessage ok
fi

echo -n "## Replacing \$katalyst_host on nginx server file... "
sed "s/\$katalyst_host/${domains}/g" ${nginx_server_template} > ${nginx_server_file}
matches=`cat ${nginx_server_file} | grep ${domains} | wc -l`
if test $matches -eq 0; then
  printMessage failed
  echo "Failed to perform changes on nginx server file, no changes found. Look into ${nginx_server_file} for more information" 
  exit 1
fi
printMessage ok

if [ -d "$data_path" ]; then
  echo -n "## Existing data found for $domains. "
  if test ${regenerate} -eq 1; then
          leCertEmit
  else
          echo -n "## Keeping the current certs"
  fi
else
  echo "## No certificates found. Performing certificate creation"
  leCertEmit
fi

if test $? -ne 0; then
  echo -n "Failed to deploy certificates. Look upstairs for errors: " 
  printMessage failed
  exit 1
fi
echo -n "## Certs emited: " 
printMessage ok
echo "## Restarting containers to reload the new certs..."
docker-compose stop
docker-compose up -d
