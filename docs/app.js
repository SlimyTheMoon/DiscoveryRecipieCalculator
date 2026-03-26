// Discovery Recipe Calculator - Client-side rendering and calculation
(function() {
    'use strict';

    let siteData = null;
    let filteredRecipes = [];
    let craftTypeIndex = {}; // craftType -> [recipe, ...]

    // Prettify commodity names: "commodity_basic_alloys" -> "Basic Alloys"
    function prettifyName(raw) {
        if (!raw) return raw;
        return raw
            .replace(/^commodity_/, '')
            .replace(/^dsy_/, '')
            .replace(/^module_/, '')
            .replace(/^special_gun/, 'Codename Gun ')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    // Calculate cooking time details: sum of consumed quantities / cooking_rate
    function calcCookingDetails(recipe, affiliationBonus) {
        if (!recipe.cookingRate || recipe.cookingRate === 0) {
            return { totalUnits: 0, rate: 0, baseTime: null, adjustedTime: null, bonus: null, items: [] };
        }
        var totalUnits = 0;
        var items = [];
        var bonus = affiliationBonus || 1;

        if (recipe.consumed) {
            for (var i = 0; i < recipe.consumed.length; i++) {
                var qty = recipe.consumed[i].quantity;
                totalUnits += qty;
                items.push({ name: recipe.consumed[i].item, quantity: qty, type: 'consumed' });
            }
        }
        if (recipe.consumedAlt) {
            for (var j = 0; j < recipe.consumedAlt.length; j++) {
                var altQty = recipe.consumedAlt[j].quantity;
                totalUnits += altQty;
                items.push({
                    name: recipe.consumedAlt[j].alternatives.join(' / '),
                    quantity: altQty,
                    type: 'alt'
                });
            }
        }

        var baseTime = (totalUnits / recipe.cookingRate) * 60;
        var adjustedTime = ((totalUnits * bonus) / recipe.cookingRate) * 60;

        return {
            totalUnits: totalUnits,
            rate: recipe.cookingRate,
            baseTime: baseTime,
            adjustedTime: bonus < 1 ? adjustedTime : null,
            bonus: bonus < 1 ? bonus : null,
            items: items
        };
    }

    function formatTime(seconds) {
        if (seconds === null || seconds === undefined) return 'N/A';
        if (seconds < 1) return '<1s';
        var parts = [];
        var hrs = Math.floor(seconds / 3600);
        var mins = Math.floor((seconds % 3600) / 60);
        var secs = Math.round(seconds % 60);
        if (hrs > 0) parts.push(hrs + 'h');
        if (mins > 0) parts.push(mins + 'm');
        if (secs > 0 || parts.length === 0) parts.push(secs + 's');
        return parts.join(' ');
    }

    // Build the cooking time breakdown section HTML
    function renderCookingSection(recipe, selectedFaction) {
        var bonus = 1;
        var factionName = '';
        if (selectedFaction && selectedFaction !== 'none' && recipe.affiliations) {
            for (var n = 0; n < recipe.affiliations.length; n++) {
                if (recipe.affiliations[n].faction === selectedFaction) {
                    bonus = recipe.affiliations[n].bonus;
                    factionName = (siteData.factions && siteData.factions[selectedFaction]) || selectedFaction;
                    break;
                }
            }
        }

        var details = calcCookingDetails(recipe, bonus);
        if (details.baseTime === null) return '';

        var html = '<div class="cooking-section">';
        html += '<div class="cooking-header">Cooking Time</div>';

        // Main time display
        html += '<div class="cooking-time-display">';
        html += '<span class="cooking-time-value">' + formatTime(details.baseTime) + '</span>';
        if (details.adjustedTime !== null) {
            html += '<span class="cooking-arrow">&rarr;</span>';
            html += '<span class="cooking-time-adjusted">' + formatTime(details.adjustedTime) + '</span>';
        }
        html += '</div>';

        // Formula
        html += '<div class="cooking-formula">';
        html += '<span>' + formatNumber(details.totalUnits) + ' units</span>';
        html += '<span class="cooking-op">&divide;</span>';
        html += '<span>' + formatNumber(details.rate) + ' units/min</span>';
        html += '<span class="cooking-op">=</span>';
        html += '<span>' + formatTime(details.baseTime) + '</span>';
        html += '</div>';

        if (details.adjustedTime !== null) {
            var savings = details.baseTime - details.adjustedTime;
            var pct = Math.round((1 - bonus) * 100);
            html += '<div class="cooking-bonus">';
            html += escapeHtml(factionName) + ' bonus: -' + pct + '% materials ';
            html += '(saves ' + formatTime(savings) + ')';
            html += '</div>';
        }

        // Per-item time bar
        if (details.items.length > 0 && details.totalUnits > 0) {
            html += '<div class="cooking-breakdown">';
            html += '<div class="cooking-bar">';
            var colors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#79c0ff','#f0883e','#a5d6ff','#7ee787','#d2a8ff'];
            for (var i = 0; i < details.items.length; i++) {
                var item = details.items[i];
                var pctWidth = (item.quantity / details.totalUnits * 100);
                if (pctWidth < 0.5) continue;
                var color = colors[i % colors.length];
                html += '<div class="cooking-bar-seg" style="width:' + pctWidth.toFixed(1) + '%;background:' + color + '" ';
                html += 'title="' + escapeHtml(prettifyName(item.name)) + ': ' + formatNumber(item.quantity) + ' (' + pctWidth.toFixed(1) + '%)">';
                html += '</div>';
            }
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function formatNumber(n) {
        return n.toLocaleString();
    }

    function getCategory(recipe) {
        return recipe.craftType || recipe.buildType || 'Uncategorized';
    }

    // Render produced items list
    function renderProducedItems(recipe) {
        if (!recipe.producedItems || recipe.producedItems.length === 0) return '';
        if (recipe.producedItems.length === 1) {
            var p = recipe.producedItems[0];
            return '<span><span class="meta-label">Produces:</span> ' +
                escapeHtml(prettifyName(p.item)) +
                (p.quantity > 1 ? ' x' + formatNumber(p.quantity) : '') + '</span>';
        }
        var html = '<div class="produced-list"><span class="meta-label">Produces:</span><ul class="produced-items-list">';
        for (var i = 0; i < recipe.producedItems.length; i++) {
            var pi = recipe.producedItems[i];
            html += '<li>' + escapeHtml(prettifyName(pi.item)) +
                ' <span class="item-qty">x' + formatNumber(pi.quantity) + '</span></li>';
        }
        html += '</ul></div>';
        return html;
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    // Render a single recipe card
    function renderRecipeCard(recipe, selectedFaction) {
        var category = getCategory(recipe);
        var badgeClass = recipe.craftType ? 'craft' : (recipe.buildType ? 'build' : '');

        var materialsHTML = '';
        if (recipe.consumed && recipe.consumed.length > 0) {
            materialsHTML += '<table class="materials-table"><thead><tr><th>Material</th><th style="text-align:right">Quantity</th></tr></thead><tbody>';
            for (var i = 0; i < recipe.consumed.length; i++) {
                var c = recipe.consumed[i];
                materialsHTML += '<tr><td class="item-name">' + escapeHtml(prettifyName(c.item)) + '</td>' +
                    '<td class="item-qty">' + formatNumber(c.quantity) + '</td></tr>';
            }
            materialsHTML += '</tbody></table>';
        }

        // Dynamic alternatives
        var altHTML = '';
        if (recipe.consumedAlt && recipe.consumedAlt.length > 0) {
            altHTML = '<table class="materials-table"><thead><tr><th>Alternative Materials (pick one)</th><th style="text-align:right">Qty</th></tr></thead><tbody>';
            for (var j = 0; j < recipe.consumedAlt.length; j++) {
                var a = recipe.consumedAlt[j];
                var names = a.alternatives.map(function(x) { return prettifyName(x); }).join(' OR ');
                altHTML += '<tr><td class="item-alt">' + escapeHtml(names) + '</td>' +
                    '<td class="item-qty">' + formatNumber(a.quantity) + '</td></tr>';
            }
            altHTML += '</tbody></table>';
        }

        // Catalysts
        var catalystHTML = '';
        if (recipe.catalysts && recipe.catalysts.length > 0) {
            catalystHTML = '<table class="materials-table"><thead><tr><th>Catalyst (not consumed)</th><th style="text-align:right">Qty</th></tr></thead><tbody>';
            for (var k = 0; k < recipe.catalysts.length; k++) {
                var cat = recipe.catalysts[k];
                catalystHTML += '<tr><td class="item-catalyst">' + escapeHtml(prettifyName(cat.item)) + '</td>' +
                    '<td class="item-qty">' + formatNumber(cat.quantity) + '</td></tr>';
            }
            catalystHTML += '</tbody></table>';
        }

        // Affiliations
        var affHTML = '';
        if (recipe.affiliations && recipe.affiliations.length > 0) {
            affHTML = '<details class="affiliations"><summary>Affiliation Bonuses (' + recipe.affiliations.length + ')</summary><div class="affiliation-list">';
            for (var m = 0; m < recipe.affiliations.length; m++) {
                var aff = recipe.affiliations[m];
                var factionName = (siteData.factions && siteData.factions[aff.faction]) || aff.faction;
                var isActive = selectedFaction === aff.faction;
                var bonusPercent = Math.round((1 - aff.bonus) * 100);
                affHTML += '<span class="affiliation-tag' + (isActive ? ' active' : '') + '">' +
                    escapeHtml(factionName) + ' (-' + bonusPercent + '%)</span>';
            }
            affHTML += '</div></details>';
        }

        // Produced items list (resolved from craftLists for factories, or single item for regular recipes)
        var producedHTML = '';
        if (recipe.craftLists && recipe.craftLists.length > 0) {
            // Factory module: resolve craft lists to actual producible items
            var producedItems = [];
            for (var pi = 0; pi < recipe.craftLists.length; pi++) {
                var craftType = recipe.craftLists[pi];
                var matching = craftTypeIndex[craftType];
                if (matching) {
                    for (var pj = 0; pj < matching.length; pj++) {
                        producedItems.push(matching[pj]);
                    }
                }
            }
            if (producedItems.length > 0) {
                producedHTML = '<details class="produced-items"><summary>Produced Items (' + producedItems.length + ')</summary>';
                producedHTML += '<table class="materials-table"><thead><tr><th>Item</th><th>Category</th><th style="text-align:right">Qty</th></tr></thead><tbody>';
                for (var pk = 0; pk < producedItems.length; pk++) {
                    var pr = producedItems[pk];
                    producedHTML += '<tr>';
                    producedHTML += '<td class="item-produced">' + escapeHtml(pr.infotext) + '</td>';
                    producedHTML += '<td class="item-craft-type">' + escapeHtml(pr.craftType || '') + '</td>';
                    producedHTML += '<td class="item-qty">' + (pr.producedQuantity > 1 ? 'x' + pr.producedQuantity : 'x1') + '</td>';
                    producedHTML += '</tr>';
                }
                producedHTML += '</tbody></table></details>';
            } else {
                // Fallback: show raw craft list names if no matching recipes found
                producedHTML = '<div class="craft-lists"><strong>Craft categories:</strong> ' +
                    recipe.craftLists.map(function(x) { return escapeHtml(x); }).join(', ') + '</div>';
            }
        }

        // Extra meta info
        var extraMeta = '';
        if (recipe.creditCost) {
            extraMeta += '<span><span class="meta-label">Cost:</span> $' + formatNumber(recipe.creditCost) + '</span>';
        }
        if (recipe.cargoStorage) {
            extraMeta += '<span><span class="meta-label">Storage:</span> ' + formatNumber(recipe.cargoStorage) + '</span>';
        }
        if (recipe.restricted) {
            extraMeta += '<span style="color:var(--red)">Restricted</span>';
        }

        // Cooking time section
        var cookingSectionHTML = renderCookingSection(recipe, selectedFaction);

        return '<div class="recipe-card">' +
            '<div class="recipe-header">' +
                '<span class="recipe-name">' + escapeHtml(recipe.infotext) + '</span>' +
                '<span class="recipe-badge ' + badgeClass + '">' + escapeHtml(category) + '</span>' +
            '</div>' +
            '<div class="recipe-meta">' +
                renderProducedItems(recipe) +
                extraMeta +
            '</div>' +
            cookingSectionHTML +
            materialsHTML + altHTML + catalystHTML + producedHTML + affHTML +
        '</div>';
    }

    // Filter and render
    function applyFilters() {
        var sourceFilter = document.getElementById('source-filter').value;
        var categoryFilter = document.getElementById('category-filter').value;
        var searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
        var factionFilter = document.getElementById('faction-filter').value;

        filteredRecipes = siteData.recipes.filter(function(r) {
            if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;

            if (categoryFilter !== 'all') {
                var cat = r.craftType || r.buildType || 'Uncategorized';
                if (cat !== categoryFilter) return false;
            }

            if (searchTerm) {
                var haystack = (r.infotext + ' ' + r.nickname + ' ' +
                    (r.producedItems || []).map(function(p) { return p.item; }).join(' ') + ' ' +
                    (r.consumed || []).map(function(c) { return c.item; }).join(' ') + ' ' +
                    (r.craftType || '') + ' ' + (r.buildType || '')).toLowerCase();
                if (haystack.indexOf(searchTerm) === -1) return false;
            }

            return true;
        });

        var container = document.getElementById('recipe-list');
        if (filteredRecipes.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:3rem;">No recipes match your filters.</p>';
        } else {
            var html = [];
            for (var i = 0; i < filteredRecipes.length; i++) {
                html.push(renderRecipeCard(filteredRecipes[i], factionFilter));
            }
            container.innerHTML = html.join('');
        }

        document.getElementById('visible-count').textContent = filteredRecipes.length;
    }

    // Populate filter dropdowns from data
    function populateFilters() {
        var categorySelect = document.getElementById('category-filter');
        var allCategories = {};

        for (var i = 0; i < siteData.recipes.length; i++) {
            var cat = siteData.recipes[i].craftType || siteData.recipes[i].buildType;
            if (cat) allCategories[cat] = true;
        }

        var sorted = Object.keys(allCategories).sort();
        for (var j = 0; j < sorted.length; j++) {
            var opt = document.createElement('option');
            opt.value = sorted[j];
            opt.textContent = sorted[j];
            categorySelect.appendChild(opt);
        }

        // Faction filter
        var factionSelect = document.getElementById('faction-filter');
        if (siteData.factions) {
            var entries = [];
            for (var key in siteData.factions) {
                if (siteData.factions.hasOwnProperty(key)) {
                    entries.push([key, siteData.factions[key]]);
                }
            }
            entries.sort(function(a, b) { return a[1].localeCompare(b[1]); });
            for (var k = 0; k < entries.length; k++) {
                var fopt = document.createElement('option');
                fopt.value = entries[k][0];
                fopt.textContent = entries[k][1];
                factionSelect.appendChild(fopt);
            }
        }

        document.getElementById('total-count').textContent = siteData.recipes.length;
    }

    // Build index: craftType -> list of recipes with that craft type
    function buildCraftTypeIndex() {
        craftTypeIndex = {};
        for (var i = 0; i < siteData.recipes.length; i++) {
            var r = siteData.recipes[i];
            if (r.craftType) {
                if (!craftTypeIndex[r.craftType]) {
                    craftTypeIndex[r.craftType] = [];
                }
                craftTypeIndex[r.craftType].push(r);
            }
        }
    }

    // Initialize
    function init() {
        fetch('data.json')
            .then(function(res) { return res.json(); })
            .then(function(data) {
                siteData = data;
                buildCraftTypeIndex();
                populateFilters();
                applyFilters();

                document.getElementById('source-filter').addEventListener('change', applyFilters);
                document.getElementById('category-filter').addEventListener('change', applyFilters);
                document.getElementById('search-input').addEventListener('input', applyFilters);
                document.getElementById('faction-filter').addEventListener('change', applyFilters);
            })
            .catch(function(err) {
                console.error('Failed to load recipe data:', err);
                document.getElementById('recipe-list').innerHTML =
                    '<p style="text-align:center;color:var(--red);padding:3rem;">Failed to load recipe data. Make sure data.json exists.</p>';
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
