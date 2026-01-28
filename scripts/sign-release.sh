#!/bin/bash
# GPG Release Signing Script for TidyCode
# This script signs release artifacts with GPG signatures for integrity verification

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RELEASES_DIR="${RELEASES_DIR:-$PROJECT_ROOT/releases}"
GPG_KEY_ID="${GPG_KEY_ID:-}"
GPG_EMAIL="${GPG_EMAIL:-}"

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if GPG is installed
check_gpg() {
    if ! command -v gpg &> /dev/null && ! command -v gpg2 &> /dev/null; then
        print_error "GPG is not installed!"
        echo "Please install GPG:"
        echo "  - Windows: choco install gpg4win"
        echo "  - macOS: brew install gnupg"
        echo "  - Linux: sudo apt install gnupg (or yum install gnupg2)"
        exit 1
    fi

    # Prefer gpg2 if available
    if command -v gpg2 &> /dev/null; then
        GPG_CMD="gpg2"
    else
        GPG_CMD="gpg"
    fi

    print_success "Found GPG: $GPG_CMD"
}

# Function to list available GPG keys
list_keys() {
    print_info "Available GPG keys:"
    $GPG_CMD --list-secret-keys --keyid-format LONG
}

# Function to get GPG key ID
get_key_id() {
    if [ -n "$GPG_KEY_ID" ]; then
        print_info "Using GPG_KEY_ID from environment: $GPG_KEY_ID"
        return
    fi

    if [ -n "$GPG_EMAIL" ]; then
        print_info "Looking up key by email: $GPG_EMAIL"
        GPG_KEY_ID=$($GPG_CMD --list-secret-keys --keyid-format LONG "$GPG_EMAIL" 2>/dev/null | grep sec | awk '{print $2}' | cut -d'/' -f2 | head -n1)

        if [ -z "$GPG_KEY_ID" ]; then
            print_error "No GPG key found for email: $GPG_EMAIL"
            exit 1
        fi

        print_success "Found key: $GPG_KEY_ID"
        return
    fi

    # Interactive selection
    print_warning "No GPG_KEY_ID or GPG_EMAIL set. Please choose a key:"
    list_keys
    echo ""
    read -p "Enter your GPG key ID (long format): " GPG_KEY_ID

    if [ -z "$GPG_KEY_ID" ]; then
        print_error "No key ID provided"
        exit 1
    fi
}

# Function to verify GPG key configuration
verify_key_config() {
    print_info "Verifying GPG key configuration..."

    # Check if using SHA1 (deprecated in Debian as of Feb 2026)
    local digest_algo=$($GPG_CMD --list-keys --with-colons "$GPG_KEY_ID" | grep "^pub" | cut -d: -f4)

    if [ "$digest_algo" = "1" ]; then
        print_error "Your key uses SHA1 which is deprecated!"
        print_warning "Debian/Ubuntu reject SHA1 signatures as of February 1, 2026"
        echo ""
        echo "Please configure GPG to use SHA256 or higher:"
        echo "  echo 'personal-digest-preferences SHA512 SHA384 SHA256' >> ~/.gnupg/gpg.conf"
        echo "  echo 'cert-digest-algo SHA512' >> ~/.gnupg/gpg.conf"
        exit 1
    fi

    # Display key info
    print_success "GPG key configuration:"
    $GPG_CMD --list-keys "$GPG_KEY_ID" | grep -A 1 "pub"
}

# Function to sign a file
sign_file() {
    local file="$1"

    if [ ! -f "$file" ]; then
        print_error "File not found: $file"
        return 1
    fi

    print_info "Signing: $(basename "$file")"

    # Create detached ASCII-armored signature
    $GPG_CMD --detach-sign --armor --default-key "$GPG_KEY_ID" "$file"

    if [ -f "${file}.asc" ]; then
        print_success "Created signature: $(basename "${file}.asc")"
    else
        print_error "Failed to create signature for: $(basename "$file")"
        return 1
    fi
}

# Function to verify a signature
verify_signature() {
    local file="$1"
    local sig_file="${file}.asc"

    if [ ! -f "$sig_file" ]; then
        sig_file="${file}.sig"
    fi

    if [ ! -f "$sig_file" ]; then
        print_warning "No signature file found for: $(basename "$file")"
        return 1
    fi

    print_info "Verifying: $(basename "$file")"

    if $GPG_CMD --verify "$sig_file" "$file" 2>&1 | grep -q "Good signature"; then
        print_success "Signature verified: $(basename "$file")"
        return 0
    else
        print_error "Signature verification failed: $(basename "$file")"
        return 1
    fi
}

# Function to create checksums file
create_checksums() {
    local files=("$@")
    local checksum_file="$RELEASES_DIR/SHA256SUMS"

    print_info "Creating SHA256 checksums..."

    cd "$RELEASES_DIR"

    # Remove old checksums file
    rm -f "$checksum_file"

    # Create new checksums
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            sha256sum "$(basename "$file")" >> "$checksum_file"
        fi
    done

    if [ -f "$checksum_file" ]; then
        print_success "Created: SHA256SUMS"

        # Sign the checksums file
        sign_file "$checksum_file"
    else
        print_error "Failed to create checksums file"
        return 1
    fi
}

# Function to export public key
export_public_key() {
    local output_file="$RELEASES_DIR/PUBLIC_KEY.asc"

    print_info "Exporting public key..."

    $GPG_CMD --armor --export "$GPG_KEY_ID" > "$output_file"

    if [ -f "$output_file" ]; then
        print_success "Exported public key: $output_file"

        # Display fingerprint
        print_info "Key fingerprint:"
        $GPG_CMD --fingerprint "$GPG_KEY_ID"
    else
        print_error "Failed to export public key"
        return 1
    fi
}

# Function to find release files
find_release_files() {
    local files=()

    # Look for common release artifacts in releases directory
    if [ -d "$RELEASES_DIR" ]; then
        # Windows installers
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find "$RELEASES_DIR" -maxdepth 1 \( -name "*.msi" -o -name "*.exe" \) -print0 2>/dev/null)

        # macOS packages
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find "$RELEASES_DIR" -maxdepth 1 \( -name "*.dmg" -o -name "*.pkg" \) -print0 2>/dev/null)

        # Linux packages
        while IFS= read -r -d '' file; do
            files+=("$file")
        done < <(find "$RELEASES_DIR" -maxdepth 1 \( -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" \) -print0 2>/dev/null)
    fi

    # Define all Tauri bundle directories to search (same as upload-to-r2.ps1)
    local bundle_dirs=(
        "$PROJECT_ROOT/src-tauri/target/release/bundle"
        "$PROJECT_ROOT/src-tauri/target/universal-apple-darwin/release/bundle"
        "$PROJECT_ROOT/src-tauri/target/x86_64-apple-darwin/release/bundle"
        "$PROJECT_ROOT/src-tauri/target/aarch64-apple-darwin/release/bundle"
        "$PROJECT_ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/bundle"
        "$PROJECT_ROOT/src-tauri/target/aarch64-pc-windows-msvc/release/bundle"
        "$PROJECT_ROOT/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
    )

    # Search each bundle directory
    for bundle_dir in "${bundle_dirs[@]}"; do
        if [ -d "$bundle_dir" ]; then
            # macOS DMG
            if [ -d "$bundle_dir/dmg" ]; then
                while IFS= read -r -d '' file; do
                    files+=("$file")
                done < <(find "$bundle_dir/dmg" \( -name "TidyCode_*_universal.dmg" -o -name "TidyCode_*_aarch64.dmg" -o -name "TidyCode_*_x64.dmg" -o -name "*.dmg" \) -print0 2>/dev/null)
            fi

            # Windows MSI
            if [ -d "$bundle_dir/msi" ]; then
                while IFS= read -r -d '' file; do
                    files+=("$file")
                done < <(find "$bundle_dir/msi" \( -name "TidyCode_*_x64_en-US.msi" -o -name "TidyCode_*_arm64_en-US.msi" -o -name "*.msi" \) -print0 2>/dev/null)
            fi

            # Windows NSIS
            if [ -d "$bundle_dir/nsis" ]; then
                while IFS= read -r -d '' file; do
                    files+=("$file")
                done < <(find "$bundle_dir/nsis" \( -name "TidyCode_*_x64-setup.exe" -o -name "TidyCode_*_arm64-setup.exe" -o -name "*.exe" \) -print0 2>/dev/null)
            fi

            # Linux AppImage
            if [ -d "$bundle_dir/appimage" ]; then
                while IFS= read -r -d '' file; do
                    files+=("$file")
                done < <(find "$bundle_dir/appimage" \( -name "TidyCode_*_amd64.AppImage" -o -name "*.AppImage" \) -print0 2>/dev/null)
            fi

            # Linux DEB
            if [ -d "$bundle_dir/deb" ]; then
                while IFS= read -r -d '' file; do
                    files+=("$file")
                done < <(find "$bundle_dir/deb" \( -name "tidycode_*_amd64.deb" -o -name "*.deb" \) -print0 2>/dev/null)
            fi

            # Linux RPM
            if [ -d "$bundle_dir/rpm" ]; then
                while IFS= read -r -d '' file; do
                    files+=("$file")
                done < <(find "$bundle_dir/rpm" \( -name "tidycode-*.x86_64.rpm" -o -name "*.rpm" \) -print0 2>/dev/null)
            fi
        fi
    done

    # Remove duplicates and output one file per line
    printf '%s\n' "${files[@]}" | sort -u
}

# Function to display usage
usage() {
    cat << EOF
GPG Release Signing Script for TidyCode

Usage: $0 [OPTIONS] [FILES...]

Options:
    -h, --help          Show this help message
    -l, --list          List available GPG keys
    -k, --key KEY_ID    Specify GPG key ID to use
    -e, --email EMAIL   Specify email to lookup GPG key
    -d, --dir DIR       Releases directory (default: ./releases)
    -v, --verify        Verify signatures instead of creating them
    -a, --auto          Auto-detect and sign all release files
    --export-key        Export public key to releases directory

Environment Variables:
    GPG_KEY_ID          GPG key ID to use for signing
    GPG_EMAIL           Email address associated with GPG key
    RELEASES_DIR        Directory containing release files

Examples:
    # Sign all release files automatically
    $0 --auto

    # Sign specific files
    $0 file1.msi file2.AppImage

    # Use specific key
    $0 --key ABCD1234 --auto

    # Verify signatures
    $0 --verify --auto

    # Export public key
    $0 --export-key

EOF
}

# Main function
main() {
    local verify_mode=false
    local auto_mode=false
    local export_key_only=false
    local files_to_sign=()

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                usage
                exit 0
                ;;
            -l|--list)
                check_gpg
                list_keys
                exit 0
                ;;
            -k|--key)
                GPG_KEY_ID="$2"
                shift 2
                ;;
            -e|--email)
                GPG_EMAIL="$2"
                shift 2
                ;;
            -d|--dir)
                RELEASES_DIR="$2"
                shift 2
                ;;
            -v|--verify)
                verify_mode=true
                shift
                ;;
            -a|--auto)
                auto_mode=true
                shift
                ;;
            --export-key)
                export_key_only=true
                shift
                ;;
            -*)
                print_error "Unknown option: $1"
                usage
                exit 1
                ;;
            *)
                files_to_sign+=("$1")
                shift
                ;;
        esac
    done

    # Check GPG installation
    check_gpg

    # Get GPG key ID
    get_key_id

    # Verify key configuration
    verify_key_config

    # Create releases directory if it doesn't exist
    mkdir -p "$RELEASES_DIR"

    # Export public key if requested
    if [ "$export_key_only" = true ]; then
        export_public_key
        exit 0
    fi

    # Auto-detect files if requested
    if [ "$auto_mode" = true ]; then
        print_info "Auto-detecting release files..."
        while IFS= read -r file; do
            [ -n "$file" ] && files_to_sign+=("$file")
        done < <(find_release_files)

        if [ ${#files_to_sign[@]} -eq 0 ]; then
            print_warning "No release files found!"
            echo "Searched in:"
            echo "  - $RELEASES_DIR"
            echo "  - $PROJECT_ROOT/src-tauri/target/release/bundle"
            echo "  - $PROJECT_ROOT/src-tauri/target/universal-apple-darwin/release/bundle"
            echo "  - $PROJECT_ROOT/src-tauri/target/x86_64-apple-darwin/release/bundle"
            echo "  - $PROJECT_ROOT/src-tauri/target/aarch64-apple-darwin/release/bundle"
            echo "  - $PROJECT_ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/bundle"
            echo "  - $PROJECT_ROOT/src-tauri/target/aarch64-pc-windows-msvc/release/bundle"
            echo "  - $PROJECT_ROOT/src-tauri/target/x86_64-unknown-linux-gnu/release/bundle"
            exit 1
        fi

        print_success "Found ${#files_to_sign[@]} file(s) to process"
    fi

    # Check if we have files to process
    if [ ${#files_to_sign[@]} -eq 0 ]; then
        print_error "No files specified!"
        usage
        exit 1
    fi

    # Process files
    if [ "$verify_mode" = true ]; then
        print_info "Verifying signatures..."
        local verified=0
        local failed=0

        for file in "${files_to_sign[@]}"; do
            if verify_signature "$file"; then
                ((verified++))
            else
                ((failed++))
            fi
        done

        echo ""
        print_info "Verification complete: $verified verified, $failed failed"

        if [ $failed -gt 0 ]; then
            exit 1
        fi
    else
        print_info "Signing files..."
        local signed=0
        local failed=0

        for file in "${files_to_sign[@]}"; do
            if sign_file "$file"; then
                ((signed++))
            else
                ((failed++))
            fi
        done

        echo ""

        # Create checksums
        create_checksums "${files_to_sign[@]}"

        # Export public key
        export_public_key

        echo ""
        print_success "Signing complete: $signed files signed, $failed failed"

        if [ $failed -gt 0 ]; then
            exit 1
        fi

        # Display summary
        echo ""
        print_info "Files in release directory:"
        ls -lh "$RELEASES_DIR" | grep -E '\.(msi|exe|dmg|AppImage|deb|rpm|asc|sig)$|SHA256SUMS|PUBLIC_KEY'
    fi
}

# Run main function
main "$@"
