<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('wp:extract')->daily();
