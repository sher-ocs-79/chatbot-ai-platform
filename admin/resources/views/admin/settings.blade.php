@extends('layouts.admin')
@section('title', 'Settings')

@section('content')
<h4 class="mb-4">Settings</h4>

<div class="card shadow-sm">
    <div class="card-body">
        <form method="POST" action="{{ route('admin.settings.update') }}">
            @csrf

            <h6 class="text-muted mb-3">WordPress Connection</h6>

            <div class="mb-3">
                <label class="form-label fw-semibold">WordPress Site URL <span class="text-danger">*</span></label>
                <input type="url" name="wp_site_url" class="form-control @error('wp_site_url') is-invalid @enderror"
                    value="{{ old('wp_site_url', $settings['wp_site_url'] ?? '') }}"
                    placeholder="https://example.com" required>
                <div class="form-text">The root URL of your WordPress site (without trailing slash).</div>
                @error('wp_site_url')<div class="invalid-feedback">{{ $message }}</div>@enderror
            </div>

            <div class="mb-3">
                <label class="form-label fw-semibold">Items Per Page</label>
                <input type="number" name="wp_per_page" class="form-control @error('wp_per_page') is-invalid @enderror"
                    value="{{ old('wp_per_page', $settings['wp_per_page'] ?? 100) }}"
                    min="1" max="100" style="width:120px;">
                <div class="form-text">Maximum 100 (WP REST API limit). All pages are fetched automatically.</div>
                @error('wp_per_page')<div class="invalid-feedback">{{ $message }}</div>@enderror
            </div>

            <hr>
            <h6 class="text-muted mb-3">Content Types</h6>

            <div class="mb-3">
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="wp_extract_posts" id="wp_extract_posts" value="1"
                        {{ ($settings['wp_extract_posts'] ?? '1') === '1' ? 'checked' : '' }}>
                    <label class="form-check-label" for="wp_extract_posts">Extract Posts</label>
                </div>
                <div class="form-check mt-1">
                    <input class="form-check-input" type="checkbox" name="wp_extract_pages" id="wp_extract_pages" value="1"
                        {{ ($settings['wp_extract_pages'] ?? '1') === '1' ? 'checked' : '' }}>
                    <label class="form-check-label" for="wp_extract_pages">Extract Pages</label>
                </div>
            </div>

            <hr>
            <h6 class="text-muted mb-3">Authentication <span class="badge bg-secondary">Optional</span></h6>
            <div class="form-text mb-3">Required only for private/password-protected WordPress sites.</div>

            <div class="row g-3 mb-4">
                <div class="col-sm-6">
                    <label class="form-label fw-semibold">Username</label>
                    <input type="text" name="wp_auth_user" class="form-control"
                        value="{{ old('wp_auth_user', $settings['wp_auth_user'] ?? '') }}"
                        autocomplete="off">
                </div>
                <div class="col-sm-6">
                    <label class="form-label fw-semibold">Application Password</label>
                    <input type="password" name="wp_auth_password" class="form-control"
                        value="{{ old('wp_auth_password', $settings['wp_auth_password'] ?? '') }}"
                        autocomplete="off">
                    <div class="form-text">Use a WordPress Application Password (not your login password).</div>
                </div>
            </div>

            <button type="submit" class="btn btn-primary">Save Settings</button>
        </form>
    </div>
</div>
@endsection
