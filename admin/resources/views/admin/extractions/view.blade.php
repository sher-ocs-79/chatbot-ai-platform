@extends('layouts.admin')
@section('title', $filename)

@section('content')
<div class="mb-3 d-flex justify-content-between align-items-center">
    <div>
        <a href="{{ route('admin.extractions.index') }}" class="text-decoration-none text-muted">← Extractions</a>
        <span class="text-muted mx-2">/</span>
        <span class="badge bg-secondary">{{ $type }}</span>
        <span class="ms-1 font-monospace small">{{ $filename }}</span>
    </div>
    <form method="POST" action="{{ route('admin.extractions.delete', [$type, $filename]) }}"
          onsubmit="return confirm('Delete this file?')">
        @csrf
        @method('DELETE')
        <button type="submit" class="btn btn-sm btn-outline-danger">Delete</button>
    </form>
</div>

<div class="card shadow-sm">
    <div class="card-body p-0">
        <pre class="m-0 p-4" style="white-space:pre-wrap;word-break:break-word;font-size:.85rem;max-height:80vh;overflow-y:auto;">{{ $content }}</pre>
    </div>
</div>
@endsection
