<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title', 'WP Extractor') — WP Extractor</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
    <style>
        body { background: #f8f9fa; }
        .sidebar { min-height: 100vh; background: #212529; }
        .sidebar a { color: #adb5bd; text-decoration: none; display: block; padding: .5rem 1rem; border-radius: .375rem; }
        .sidebar a:hover, .sidebar a.active { color: #fff; background: #343a40; }
        .sidebar .brand { color: #fff; font-weight: 700; font-size: 1.1rem; padding: 1rem; border-bottom: 1px solid #343a40; margin-bottom: .5rem; }
        .main { min-height: 100vh; }
    </style>
</head>
<body>
<div class="d-flex">
    <div class="sidebar col-auto p-2" style="width:220px;">
        <div class="brand">⚙ WP Extractor</div>
        <a href="{{ route('admin.dashboard') }}" class="{{ request()->routeIs('admin.dashboard') ? 'active' : '' }}">Dashboard</a>
        <a href="{{ route('admin.settings') }}" class="{{ request()->routeIs('admin.settings') ? 'active' : '' }}">Settings</a>
        <a href="{{ route('admin.extractions.index') }}" class="{{ request()->routeIs('admin.extractions.*') ? 'active' : '' }}">Extractions</a>
        <hr class="border-secondary">
        <form action="{{ route('logout') }}" method="POST">
            @csrf
            <button type="submit" class="btn btn-sm btn-outline-secondary w-100">Logout</button>
        </form>
    </div>

    <div class="main flex-grow-1 p-4">
        @if(session('success'))
            <div class="alert alert-success alert-dismissible fade show">
                {{ session('success') }}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        @endif
        @if(session('error'))
            <div class="alert alert-danger alert-dismissible fade show">
                {{ session('error') }}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        @endif

        @yield('content')
    </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
