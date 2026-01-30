# Extension Guidelines

## Adding New Features

1. **Determine scope**: Deck vs NVIDIA
2. **Add packages** to appropriate Containerfile stage
3. **Create configs** in relevant `system_files/` directory
4. **Add services** if needed
5. **Update Just commands** if new functionality required

## Configuration Files

- **Deck settings**: `system_files/deck/*/etc/`
- **User configs**: `system_files/*/usr/share/` or `/etc/skel/`
- **Services**: `system_files/*/usr/lib/systemd/system/`
- **Just commands**: `system_files/*/usr/share/ublue-os/just/`

## Common Patterns

### Adding COPR Packages

```dockerfile
# In appropriate RUN instruction
dnf5 -y copr enable username/repo
dnf5 -y install package-name
# Remember to disable copr in cleanup
dnf5 -y copr disable username/repo
```

### System Services

```bash
# Enable service
systemctl enable service-name

# Create override
mkdir -p /etc/systemd/system/service.service.d/
echo "[Service]" > override.conf
```

### Desktop Integration

```bash
# KDE: Copy to /usr/share/applications/
# Update /etc/skel/ for new user defaults
```

## Security Considerations

- **SELinux**: Enforced by default
- **Secure boot**: Custom key enrollment supported
- **Image signing**: Cosign verification available
- **Immutable base**: Changes via package layering only

## Performance Optimizations

- **ZRAM**: 4GB compressed swap (Deck variant)
- **CPU schedulers**: LAVD/BORE for gaming
- **I/O scheduler**: Kyber for responsiveness
- **Kernel parameters**: Gaming-optimized defaults
