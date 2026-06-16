@extends('layouts.admin')
@section('title', 'Dashboard')

@section('content')
<h4 class="mb-4">Dashboard</h4>

<div class="row g-3 mb-4">
    <div class="col-sm-4">
        <div class="card text-center shadow-sm">
            <div class="card-body">
                <h2 class="display-5 fw-bold text-primary">{{ $postCount }}</h2>
                <p class="text-muted mb-0">Extracted Posts</p>
            </div>
        </div>
    </div>
    <div class="col-sm-4">
        <div class="card text-center shadow-sm">
            <div class="card-body">
                <h2 class="display-5 fw-bold text-success">{{ $pageCount }}</h2>
                <p class="text-muted mb-0">Extracted Pages</p>
            </div>
        </div>
    </div>
    <div class="col-sm-4">
        <div class="card text-center shadow-sm">
            <div class="card-body">
                <h2 class="display-5 fw-bold text-secondary">{{ $postCount + $pageCount }}</h2>
                <p class="text-muted mb-0">Total Files</p>
            </div>
        </div>
    </div>
</div>

<div class="card shadow-sm mb-4">
    <div class="card-body">
        <h6 class="card-title">WordPress Site</h6>
        <p class="mb-0">
            @if($siteUrl && $siteUrl !== 'Not configured')
                <a href="{{ $siteUrl }}" target="_blank">{{ $siteUrl }}</a>
            @else
                <span class="text-warning">⚠ Not configured — <a href="{{ route('admin.settings') }}">go to Settings</a></span>
            @endif
        </p>
    </div>
</div>

<div class="card shadow-sm">
    <div class="card-body">
        <h6 class="card-title mb-3">Quick Extract</h6>
        <form method="POST" action="{{ route('admin.extractions.run') }}">
            @csrf
            <div class="d-flex gap-2">
                <select name="type" class="form-select w-auto">
                    <option value="both">Posts &amp; Pages</option>
                    <option value="posts">Posts only</option>
                    <option value="pages">Pages only</option>
                </select>
                <button type="submit" class="btn btn-primary">Run Extraction</button>
                <a href="{{ route('admin.extractions.index') }}" class="btn btn-outline-secondary">View Files</a>
            </div>
        </form>
    </div>
</div>
@endsection
