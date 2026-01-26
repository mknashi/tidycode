#!/bin/bash
# GPG Setup Script for TidyCode
# This script helps you generate and configure a GPG key for code signing

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check GPG installation
check_gpg() {
    if ! command -v gpg &> /dev/null && ! command -v gpg2 &> /dev/null; then
        print_error "GPG is not installed!"
        echo ""
        echo "Installation instructions:"
        echo "  Windows: choco install gpg4win"
        echo "           or download from https://www.gpg4win.org/"
        echo "  macOS:   brew install gnupg"
        echo "  Ubuntu:  sudo apt install gnupg"
        echo "  Fedora:  sudo yum install gnupg2"
        exit 1
    fi

    if command -v gpg2 &> /dev/null; then
        GPG_CMD="gpg2"
    else
        GPG_CMD="gpg"
    fi

    print_success "Found GPG: $GPG_CMD"
}

# Display banner
show_banner() {
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              TidyCode GPG Key Setup Wizard                   ║
║                                                              ║
║  This wizard will help you create and configure a GPG key   ║
║  for signing your TidyCode releases.                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

EOF
}

# Configure GPG for modern security
configure_gpg() {
    print_info "Configuring GPG for code signing..."

    local gpg_conf="$HOME/.gnupg/gpg.conf"

    # Backup existing config
    if [ -f "$gpg_conf" ]; then
        cp "$gpg_conf" "$gpg_conf.backup.$(date +%Y%m%d_%H%M%S)"
        print_info "Backed up existing gpg.conf"
    fi

    # Ensure .gnupg directory exists
    mkdir -p "$HOME/.gnupg"
    chmod 700 "$HOME/.gnupg"

    # Add modern security settings (avoiding SHA1 - deprecated in Debian Feb 2026)
    cat >> "$gpg_conf" << 'GPGCONF'

# ========================================
# TidyCode Code Signing Configuration
# Added by setup-gpg.sh
# ========================================

# Use SHA256+ for digest (SHA1 deprecated Feb 2026)
personal-digest-preferences SHA512 SHA384 SHA256
cert-digest-algo SHA512
default-preference-list SHA512 SHA384 SHA256 AES256 AES192 AES ZLIB BZIP2 ZIP Uncompressed

# Stronger algorithms
personal-cipher-preferences AES256 AES192 AES
personal-compress-preferences ZLIB BZIP2 ZIP Uncompressed

# Long key IDs for clarity
keyid-format 0xlong

# Show fingerprints
with-fingerprint

# Require cross-certification on subkeys
require-cross-certification

# Don't use SHA1 for anything
weak-digest SHA1

GPGCONF

    print_success "GPG configuration updated"
}

# Generate GPG key
generate_key() {
    print_info "Generating new GPG key..."
    echo ""

    # Collect information
    read -p "Your name (or company name): " name
    read -p "Your email address: " email
    read -p "Comment (optional, e.g., 'TidyCode Signing Key'): " comment

    echo ""
    print_info "Key expiration recommendation: 2-5 years"
    print_warning "You can extend the expiration before it expires"
    read -p "Key expiration (0 = does not expire, 2y = 2 years): " expiration

    if [ -z "$expiration" ]; then
        expiration="2y"
    fi

    echo ""
    print_info "Creating key with the following details:"
    echo "  Name:       $name"
    echo "  Email:      $email"
    echo "  Comment:    $comment"
    echo "  Expiration: $expiration"
    echo "  Key size:   4096 bits (RSA)"
    echo ""

    read -p "Proceed? (y/n): " proceed

    if [[ ! "$proceed" =~ ^[Yy]$ ]]; then
        print_warning "Key generation cancelled"
        exit 0
    fi

    # Create key generation batch file
    local batch_file=$(mktemp)

    cat > "$batch_file" << KEYGEN
%echo Generating GPG key for TidyCode code signing...
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: $name
Name-Email: $email
Name-Comment: $comment
Expire-Date: $expiration
%commit
%echo Key generation complete!
KEYGEN

    # Generate the key
    $GPG_CMD --batch --generate-key "$batch_file"

    rm -f "$batch_file"

    echo ""
    print_success "GPG key generated successfully!"

    # Get the key ID
    KEY_ID=$($GPG_CMD --list-secret-keys --keyid-format LONG "$email" 2>/dev/null | grep sec | awk '{print $2}' | cut -d'/' -f2 | head -n1)

    if [ -n "$KEY_ID" ]; then
        print_success "Your key ID is: $KEY_ID"
        return 0
    else
        print_error "Failed to retrieve key ID"
        return 1
    fi
}

# Display key information
show_key_info() {
    local email="$1"

    echo ""
    print_info "Your GPG key details:"
    echo ""

    $GPG_CMD --list-keys --keyid-format LONG "$email"

    echo ""
    print_info "Your key fingerprint:"
    $GPG_CMD --fingerprint "$email"
}

# Export keys
export_keys() {
    local email="$1"
    local output_dir="$HOME/gpg-backup-$(date +%Y%m%d)"

    mkdir -p "$output_dir"

    print_info "Exporting keys to: $output_dir"

    # Export public key
    $GPG_CMD --armor --export "$email" > "$output_dir/public-key.asc"
    print_success "Exported public key: $output_dir/public-key.asc"

    # Export private key (encrypted)
    $GPG_CMD --armor --export-secret-keys "$email" > "$output_dir/private-key.asc"
    print_success "Exported private key: $output_dir/private-key.asc"

    # Generate revocation certificate
    $GPG_CMD --output "$output_dir/revocation-certificate.asc" --gen-revoke "$email" <<< "y
0

Revocation certificate generated during setup
y
"
    print_success "Generated revocation certificate: $output_dir/revocation-certificate.asc"

    echo ""
    print_warning "IMPORTANT: Keep these files secure!"
    echo "  - Store private-key.asc in a secure, encrypted location"
    echo "  - Store revocation-certificate.asc separately (in case you need to revoke the key)"
    echo "  - You can share public-key.asc publicly"
    echo ""
    print_info "Backup location: $output_dir"
}

# Upload to keyservers
upload_to_keyservers() {
    local key_id="$1"

    echo ""
    print_info "Uploading public key to keyservers..."

    # Upload to multiple keyservers
    local keyservers=(
        "keyserver.ubuntu.com"
        "keys.openpgp.org"
        "pgp.mit.edu"
    )

    for server in "${keyservers[@]}"; do
        print_info "Uploading to $server..."
        if $GPG_CMD --keyserver "$server" --send-keys "$key_id" 2>&1 | grep -q "success"; then
            print_success "Uploaded to $server"
        else
            print_warning "Failed to upload to $server (may need manual verification)"
        fi
    done
}

# Create environment file
create_env_file() {
    local email="$1"
    local key_id="$2"
    local env_file=".env.local"

    if [ -f "$env_file" ]; then
        print_warning "$env_file already exists. Appending GPG configuration..."
        echo "" >> "$env_file"
    fi

    cat >> "$env_file" << ENVFILE
# GPG Code Signing Configuration
# Added by setup-gpg.sh
GPG_KEY_ID=$key_id
GPG_EMAIL=$email
ENVFILE

    print_success "Added GPG configuration to $env_file"
}

# Display next steps
show_next_steps() {
    local email="$1"
    local key_id="$2"

    cat << EOF

╔══════════════════════════════════════════════════════════════╗
║                    Setup Complete! 🎉                        ║
╚══════════════════════════════════════════════════════════════╝

Your GPG key is ready for code signing!

Key Information:
  Email:  $email
  Key ID: $key_id

Next Steps:

1. Test your signing setup:
   $(which bash) scripts/sign-release.sh --help

2. Sign release files:
   $(which bash) scripts/sign-release.sh --auto

3. Share your public key:
   - Publish to your website
   - Include in GitHub releases
   - Add fingerprint to README

4. Configure CI/CD:
   - Export GPG_PRIVATE_KEY secret (base64 encoded)
   - Export GPG_PASSPHRASE secret
   - Use in GitHub Actions/GitLab CI

5. Backup Management:
   - Store private key backup securely (encrypted location)
   - Keep revocation certificate safe
   - Set calendar reminder to extend expiration before it expires

Documentation:
  - See docs/CODE_SIGNING.md for detailed instructions
  - Linux section has complete GPG signing guide

For help:
  $(which bash) scripts/sign-release.sh --help

EOF
}

# Main menu
main() {
    show_banner

    # Check GPG installation
    check_gpg

    echo ""
    print_info "What would you like to do?"
    echo ""
    echo "1) Generate a new GPG key for code signing"
    echo "2) Configure existing GPG key"
    echo "3) List existing GPG keys"
    echo "4) Exit"
    echo ""

    read -p "Choose an option (1-4): " choice

    case $choice in
        1)
            configure_gpg
            generate_key

            if [ $? -eq 0 ]; then
                local email
                read -p "Enter your email again to continue: " email

                show_key_info "$email"

                KEY_ID=$($GPG_CMD --list-secret-keys --keyid-format LONG "$email" 2>/dev/null | grep sec | awk '{print $2}' | cut -d'/' -f2 | head -n1)

                # Ask about exports
                read -p "Export and backup keys? (recommended) (y/n): " export_choice
                if [[ "$export_choice" =~ ^[Yy]$ ]]; then
                    export_keys "$email"
                fi

                # Ask about keyserver upload
                read -p "Upload public key to keyservers? (y/n): " upload_choice
                if [[ "$upload_choice" =~ ^[Yy]$ ]]; then
                    upload_to_keyservers "$KEY_ID"
                fi

                # Create env file
                read -p "Add to .env.local file? (y/n): " env_choice
                if [[ "$env_choice" =~ ^[Yy]$ ]]; then
                    create_env_file "$email" "$KEY_ID"
                fi

                show_next_steps "$email" "$KEY_ID"
            fi
            ;;
        2)
            configure_gpg
            print_success "GPG configuration updated!"
            echo ""
            print_info "Your existing keys:"
            $GPG_CMD --list-secret-keys --keyid-format LONG
            ;;
        3)
            echo ""
            print_info "Existing GPG keys:"
            $GPG_CMD --list-secret-keys --keyid-format LONG
            ;;
        4)
            print_info "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid option"
            exit 1
            ;;
    esac
}

# Run main
main
