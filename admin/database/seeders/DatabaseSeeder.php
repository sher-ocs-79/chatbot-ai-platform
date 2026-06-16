<?php

namespace Database\Seeders;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Create default admin user if none exists
        User::firstOrCreate(
            ['email' => env('ADMIN_EMAIL', 'admin@example.com')],
            [
                'name'     => 'Admin',
                'password' => Hash::make(env('ADMIN_PASSWORD', 'changeme')),
            ]
        );

        // Default extraction settings
        $defaults = [
            'wp_site_url'      => '',
            'wp_per_page'      => '100',
            'wp_extract_posts' => '1',
            'wp_extract_pages' => '1',
            'wp_auth_user'     => '',
            'wp_auth_password' => '',
        ];

        foreach ($defaults as $key => $value) {
            Setting::firstOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
