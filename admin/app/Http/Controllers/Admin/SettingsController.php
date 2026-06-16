<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function index()
    {
        $settings = Setting::getAll();
        return view('admin.settings', compact('settings'));
    }

    public function update(Request $request)
    {
        $request->validate([
            'wp_site_url'      => ['required', 'url'],
            'wp_per_page'      => ['required', 'integer', 'min:1', 'max:100'],
            'wp_extract_posts' => ['nullable', 'boolean'],
            'wp_extract_pages' => ['nullable', 'boolean'],
            'wp_auth_user'     => ['nullable', 'string', 'max:255'],
            'wp_auth_password' => ['nullable', 'string', 'max:255'],
        ]);

        Setting::set('wp_site_url', rtrim($request->wp_site_url, '/'));
        Setting::set('wp_per_page', $request->wp_per_page);
        Setting::set('wp_extract_posts', $request->has('wp_extract_posts') ? '1' : '0');
        Setting::set('wp_extract_pages', $request->has('wp_extract_pages') ? '1' : '0');
        Setting::set('wp_auth_user', $request->wp_auth_user ?? '');
        Setting::set('wp_auth_password', $request->wp_auth_password ?? '');

        return back()->with('success', 'Settings saved successfully.');
    }
}
