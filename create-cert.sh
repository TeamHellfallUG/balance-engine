#!/usr/bin/env bash
openssl genrsa 1024 > ./example/key.pem
openssl req -x509 -new -key ./example/key.pem > ./example/cert.pem