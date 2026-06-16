@extends('layouts.admin')
@section('title', 'Extractions')

@section('content')
<div class="d-flex justify-content-between align-items-center mb-4">
    <h4 class="mb-0">Extractions</h4>
    <div class="d-flex gap-2">
        <form method="POST" action="{{ route('admin.extractions.run') }}" class="d-flex gap-2">
            @csrf
            <select name="type" class="form-select form-select-sm w-auto">
                <option value="both">Posts &amp; Pages</option>
                <option value="posts">Posts only</option>
                <option value="pages">Pages only</option>
            </select>
            <button type="submit" class="btn btn-sm btn-primary">Run Extraction</button>
        </form>
    </div>
</div>

@foreach(['posts', 'pages'] as $type)
<div class="card shadow-sm mb-4">
    <div class="card-header d-flex justify-content-between align-items-center">
        <strong>{{ ucfirst($type) }}</strong>
        <span class="badge bg-secondary">{{ count($files[$type]) }} files</span>
    </div>

    @if(count($files[$type]) > 0)
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Filename</th>
                            <th>Size</th>
                            <th>Last Modified</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($files[$type] as $file)
                        <tr>
                            <td class="font-monospace small">{{ $file['name'] }}</td>
                            <td class="text-muted small">{{ number_format($file['size'] / 1024, 1) }} KB</td>
                            <td class="text-muted small">{{ date('Y-m-d H:i', $file['modified']) }}</td>
                            <td class="text-end">
                                <a href="{{ route('admin.extractions.view', [$type, $file['name']]) }}"
                                   class="btn btn-xs btn-outline-secondary btn-sm">View</a>
                                <form method="POST"
                                      action="{{ route('admin.extractions.delete', [$type, $file['name']]) }}"
                                      class="d-inline"
                                      onsubmit="return confirm('Delete {{ $file['name'] }}?')">
                                    @csrf
                                    @method('DELETE')
                                    <button type="submit" class="btn btn-sm btn-outline-danger">Delete</button>
                                </form>
                            </td>
                        </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
        <div class="card-footer text-end">
            <form method="POST" action="{{ route('admin.extractions.clear') }}"
                  onsubmit="return confirm('Clear all {{ $type }}?')">
                @csrf
                <input type="hidden" name="type" value="{{ $type }}">
                <button type="submit" class="btn btn-sm btn-outline-danger">Clear All {{ ucfirst($type) }}</button>
            </form>
        </div>
    @else
        <div class="card-body text-muted">No {{ $type }} extracted yet.</div>
    @endif
</div>
@endforeach
@endsection
