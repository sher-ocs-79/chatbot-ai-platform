<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;

class DashboardController extends Controller
{
    public function index()
    {
        $postsDir  = storage_path('app/extractions/posts');
        $pagesDir  = storage_path('app/extractions/pages');
        $postCount = is_dir($postsDir) ? count(glob("{$postsDir}/*.txt")) : 0;
        $pageCount = is_dir($pagesDir) ? count(glob("{$pagesDir}/*.txt")) : 0;
        $siteUrl   = Setting::get('wp_site_url', 'Not configured');

        return view('admin.dashboard', compact('postCount', 'pageCount', 'siteUrl'));
    }
}
