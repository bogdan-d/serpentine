#!/usr/bin/env bash
set -euo pipefail

readonly CONTEXT_DIR=/run/context/build_files/plasma-patches
readonly OUTPUT_DIR=/plasma-patch-rpms
readonly TOPDIR=/var/tmp/rpmbuild
readonly SRPM_DIR=/var/tmp/plasma-patch-srpms

# Patches originate from https://gist.github.com/nicman23/5a735e5293163b80650f4cbb88f6450b.
mkdir -p "${OUTPUT_DIR}" "${SRPM_DIR}" "${TOPDIR}"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}

dnf5 install -y rpm-build

for package in kscreenlocker kwin; do
    source_rpm=$(rpm -q --qf '%{SOURCERPM}' "${package}")
    dnf5 download --source --destdir "${SRPM_DIR}" "${source_rpm%.src.rpm}"
done

dnf5 --setopt='disable_excludes=*' builddep -y --srpm "${SRPM_DIR}"/*.src.rpm
rpm -ivh --define "_topdir ${TOPDIR}" "${SRPM_DIR}"/*.src.rpm

for package in kscreenlocker kwin; do
    patch_name="${package}.patch"
    spec="${TOPDIR}/SPECS/${package}.spec"

    cp "${CONTEXT_DIR}/${patch_name}" "${TOPDIR}/SOURCES/"
    sed -i "/^Source1:/a Patch100: ${patch_name}" "${spec}"
    sed -i -E 's/^(Release:[[:space:]]*[^%[:space:]]+)/\1.serpentine1/' "${spec}"
    rpmbuild -ba --define "_topdir ${TOPDIR}" "${spec}"
done

for package in kscreenlocker kwin kwin-common kwin-libs; do
    find "${TOPDIR}/RPMS" -type f -name "${package}-[0-9]*.rpm" -exec cp {} "${OUTPUT_DIR}/" \;
done
