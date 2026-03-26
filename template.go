package main

const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discovery Recipe Calculator</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <h1>Discovery Recipe Calculator</h1>
        <p class="subtitle">Crafting reference for Discovery Freelancer</p>
    </header>

    <main>
        <section class="controls">
            <div class="filter-group">
                <label for="source-filter">Source:</label>
                <select id="source-filter">
                    <option value="all">All</option>
                    <option value="items">Items</option>
                    <option value="modules">Modules</option>
                </select>
            </div>

            <div class="filter-group">
                <label for="category-filter">Category:</label>
                <select id="category-filter">
                    <option value="all">All Categories</option>
                </select>
            </div>

            <div class="filter-group">
                <label for="search-input">Search:</label>
                <input type="text" id="search-input" placeholder="Search recipes...">
            </div>

            <div class="filter-group">
                <label for="faction-search">Affiliation Bonus:</label>
                <div class="faction-autocomplete">
                    <input type="text" id="faction-search" placeholder="Search factions..." autocomplete="off">
                    <input type="hidden" id="faction-filter" value="none">
                    <button type="button" id="faction-clear" class="faction-clear-btn" style="display:none" title="Clear selection">&times;</button>
                    <div id="faction-dropdown" class="faction-dropdown"></div>
                </div>
                <label class="faction-only-label" id="faction-only-label" style="display:none">
                    <input type="checkbox" id="faction-only-filter"> Only with bonus
                </label>
            </div>

            <div class="stats" id="stats-bar">
                Showing <span id="visible-count">0</span> of <span id="total-count">0</span> recipes
            </div>
        </section>

        <section id="recipe-list" class="recipe-list">
        </section>
    </main>

    <footer>
        <p>Discovery Recipe Calculator &mdash; Data parsed from game configuration files</p>
    </footer>

    <script src="app.js"></script>
</body>
</html>
`
