ARG BASE_IMAGE=ghcr.io/ublue-os/bazzite:latest
# Allow build scripts to be referenced without being copied into the final image
FROM scratch AS ctx

COPY system_files /files
COPY build_files /build_files

# Base Image
# FROM ghcr.io/ublue-os/bazzite:stable
FROM ${BASE_IMAGE}

ARG BASE_IMAGE
ARG IMAGE_NAME="${IMAGE_NAME:-serpentine}"
ARG IMAGE_VENDOR="${IMAGE_VENDOR:-bogdan-d}"

## Other possible base images include:
# FROM ghcr.io/ublue-os/bazzite:latest
# FROM ghcr.io/ublue-os/bluefin-nvidia:stable
#
# ... and so on, here are more base images
# Universal Blue Images: https://github.com/orgs/ublue-os/packages
# Fedora base image: quay.io/fedora/fedora-bootc:42
# CentOS base images: quay.io/centos-bootc/centos-bootc:stream10

### [IM]MUTABLE /opt
## Some bootable images, like Fedora, have /opt symlinked to /var/opt, in order to
## make it mutable/writable for users. However, some packages write files to this directory,
## thus its contents might be wiped out when bootc deploys an image, making it troublesome for
## some packages. Eg, google-chrome, docker-desktop.
##
## Uncomment the following line if one desires to make /opt immutable and be able to be used
## by the package manager.

RUN rm /opt && mkdir /opt

### MODIFICATIONS
## make modifications desired in your image and install packages by modifying the build.sh script
## the following RUN directive does all the things required to run "build.sh" as recommended.

RUN --mount=type=bind,from=ctx,source=/,target=/run/context \
    --mount=type=cache,dst=/var/cache \
    --mount=type=cache,dst=/var/log \
    --mount=type=tmpfs,dst=/tmp \
    mkdir -p /var/roothome && \
    /run/context/build_files/build.sh

### LINTING
## Verify final image and contents are correct.
## fix: don't leak /{run,tmp} into the final image
## Got exposed with bootc 1.13
## See: https://github.com/bootc-dev/bootc/commit/d5c6515e237d7e8b9b1e385fbc393e8c517eafad
RUN --network=none \
    --mount=type=tmpfs,dst=/run \
    bootc container lint
