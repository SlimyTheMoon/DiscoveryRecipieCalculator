// Discovery Recipe Calculator - Client-side rendering and calculation
(function() {
    'use strict';

    let siteData = null;
    let filteredRecipes = [];
    let craftTypeIndex = {}; // craftType -> [recipe, ...]
    let dailyModeCards = {}; // recipeIndex -> true if 24h mode
    let calcData = {}; // recipeIndex -> { prices: { itemKey: price }, open: bool }
    var hFuelHalf = false; // global toggle: H-fuel uses half units

    // Fuel items that participate in the half-H-fuel mechanic
    var HFUEL_ITEM = 'commodity_h_fuel';

    // Check if a consumedAlt group contains fuel alternatives (Mox/Promethene/H-fuel)
    function isFuelAltGroup(alternatives) {
        return alternatives && alternatives.indexOf(HFUEL_ITEM) !== -1;
    }

    // Get effective alt quantity: if hFuelHalf is on, and the group is a fuel alt group,
    // the H-fuel quantity is halved; Mox/Promethene keep the listed quantity.
    // For display in the materials table we show each fuel with its effective qty.
    function getFuelAltDisplay(altEntry, bonusFactor, mult) {
        var bf = bonusFactor || 1;
        var m = mult || 1;
        if (!hFuelHalf || !isFuelAltGroup(altEntry.alternatives)) {
            return null; // use default display
        }
        var rows = [];
        for (var i = 0; i < altEntry.alternatives.length; i++) {
            var name = altEntry.alternatives[i];
            var qty = altEntry.quantity;
            if (name === HFUEL_ITEM) qty = Math.ceil(qty / 2);
            rows.push({ name: name, quantity: Math.floor(qty * bf * m) });
        }
        return rows;
    }

    // Prettify commodity names: use real name from commodityNames, fallback to auto-prettify
    function prettifyName(raw) {
        if (!raw) return raw;
        if (siteData && siteData.commodityNames && siteData.commodityNames[raw]) {
            return siteData.commodityNames[raw];
        }
        return raw
            .replace(/^commodity_/, '')
            .replace(/^dsy_/, '')
            .replace(/^module_/, '')
            .replace(/^special_gun/, 'Codename Gun ')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }

    // Calculate cooking time details: sum of consumed (quantity * volume) / cooking_rate
    function calcCookingDetails(recipe, affiliationBonus) {
        if (!recipe.cookingRate || recipe.cookingRate === 0) {
            return { totalVolume: 0, rate: 0, baseTime: null, adjustedTime: null, bonus: null, items: [] };
        }
        var totalVolume = 0;
        var items = [];
        var bonus = affiliationBonus || 1;
        var volumes = (siteData && siteData.volumes) || {};

        if (recipe.consumed) {
            for (var i = 0; i < recipe.consumed.length; i++) {
                var qty = recipe.consumed[i].quantity;
                var vol = volumes[recipe.consumed[i].item] || 1;
                var itemVol = qty * vol;
                totalVolume += itemVol;
                items.push({ name: recipe.consumed[i].item, quantity: qty, volume: itemVol, type: 'consumed' });
            }
        }
        if (recipe.consumedAlt) {
            for (var j = 0; j < recipe.consumedAlt.length; j++) {
                var altQty = recipe.consumedAlt[j].quantity;
                var altName = recipe.consumedAlt[j].alternatives[0] || '';
                var altVol = volumes[altName] || 1;
                var altItemVol = altQty * altVol;
                totalVolume += altItemVol;
                items.push({
                    name: recipe.consumedAlt[j].alternatives.join(' / '),
                    quantity: altQty,
                    volume: altItemVol,
                    type: 'alt'
                });
            }
        }

        var baseTime = (totalVolume / recipe.cookingRate) * 60;
        var adjustedTime = ((totalVolume * bonus) / recipe.cookingRate) * 60;

        return {
            totalVolume: totalVolume,
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
        html += '<span>' + formatNumber(details.totalVolume) + ' vol</span>';
        html += '<span class="cooking-op">&divide;</span>';
        html += '<span>' + formatNumber(details.rate) + ' vol/min</span>';
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
        if (details.items.length > 0 && details.totalVolume > 0) {
            html += '<div class="cooking-breakdown">';
            html += '<div class="cooking-bar">';
            var colors = ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#79c0ff','#f0883e','#a5d6ff','#7ee787','#d2a8ff'];
            for (var i = 0; i < details.items.length; i++) {
                var item = details.items[i];
                var pctWidth = (item.volume / details.totalVolume * 100);
                if (pctWidth < 0.5) continue;
                var color = colors[i % colors.length];
                html += '<div class="cooking-bar-seg" style="width:' + pctWidth.toFixed(1) + '%;background:' + color + '" ';
                html += 'title="' + escapeHtml(prettifyName(item.name)) + ': ' + formatNumber(item.volume) + ' vol (' + pctWidth.toFixed(1) + '%)">';
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
    function renderProducedItems(recipe, mult) {
        if (!recipe.producedItems || recipe.producedItems.length === 0) return '';
        var m = mult || 1;
        if (recipe.producedItems.length === 1) {
            var p = recipe.producedItems[0];
            var qty = Math.floor(p.quantity * m);
            return '<span><span class="meta-label">Produces:</span> ' +
                escapeHtml(prettifyName(p.item)) +
                (qty > 1 ? ' x' + formatNumber(qty) : '') + '</span>';
        }
        var html = '<div class="produced-list"><span class="meta-label">Produces:</span><ul class="produced-items-list">';
        for (var i = 0; i < recipe.producedItems.length; i++) {
            var pi = recipe.producedItems[i];
            var piQty = Math.floor(pi.quantity * m);
            html += '<li>' + escapeHtml(prettifyName(pi.item)) +
                ' <span class="item-qty">x' + formatNumber(piQty) + '</span></li>';
        }
        html += '</ul></div>';
        return html;
    }

    // Compute 24h multiplier for a recipe
    function get24hMultiplier(recipe, selectedFaction) {
        var bonus = 1;
        if (selectedFaction && selectedFaction !== 'none' && recipe.affiliations) {
            for (var n = 0; n < recipe.affiliations.length; n++) {
                if (recipe.affiliations[n].faction === selectedFaction) {
                    bonus = recipe.affiliations[n].bonus;
                    break;
                }
            }
        }
        var details = calcCookingDetails(recipe, bonus);
        if (details.baseTime === null || details.baseTime === 0) return null;
        var cookTime = details.adjustedTime !== null ? details.adjustedTime : details.baseTime;
        return (24 * 60 * 60) / cookTime;
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    // Render profit calculator section
    function renderCalcSection(recipe, recipeIdx, mult, bonus) {
        var bFactor = bonus || 1;
        var hasConsumed = (recipe.consumed && recipe.consumed.length > 0) || (recipe.consumedAlt && recipe.consumedAlt.length > 0);
        var hasProduced = recipe.producedItems && recipe.producedItems.length > 0;
        if (!hasConsumed && !hasProduced) return '';

        var cd = calcData[recipeIdx] || { prices: {}, open: false };
        var html = '<div class="calc-section">';
        html += '<button class="calc-toggle-btn" data-calc-idx="' + recipeIdx + '">';
        html += (cd.open ? '&#9662;' : '&#9656;') + ' Profit Calculator</button>';

        if (cd.open) {
            html += '<div class="calc-panel">';

            // Consumed items price inputs
            var totalCost = 0;
            if (hasConsumed) {
                html += '<div class="calc-group-label">Buy Prices (consumed per unit)</div>';
                html += '<div class="calc-item-rows">';
                if (recipe.consumed) {
                    for (var i = 0; i < recipe.consumed.length; i++) {
                        var c = recipe.consumed[i];
                        var key = 'buy_' + i;
                        var price = cd.prices[key] || 0;
                        var adjQty = Math.round(c.quantity * bFactor * mult);
                        var lineCost = adjQty * price;
                        totalCost += lineCost;
                        html += '<div class="calc-item-row">';
                        html += '<span class="calc-item-name">' + escapeHtml(prettifyName(c.item)) + ' <span class="calc-item-qty">x' + formatNumber(adjQty) + (bFactor < 1 ? ' <span class="calc-bonus-tag">(-' + Math.round((1-bFactor)*100) + '%)</span>' : '') + '</span></span>';
                        html += '<input type="number" class="calc-input" data-calc-price="' + recipeIdx + '" data-calc-key="' + key + '" value="' + (price || '') + '" min="0" step="any" placeholder="0">';
                        html += '</div>';
                    }
                }
                if (recipe.consumedAlt) {
                    for (var j = 0; j < recipe.consumedAlt.length; j++) {
                        var a = recipe.consumedAlt[j];
                        var fuelCalcRows = getFuelAltDisplay(a, bFactor, mult);
                        if (fuelCalcRows) {
                            for (var fc = 0; fc < fuelCalcRows.length; fc++) {
                                var fcKey = 'alt_' + j + '_' + fc;
                                var fcPrice = cd.prices[fcKey] || 0;
                                var fcCost = fuelCalcRows[fc].quantity * fcPrice;
                                totalCost += fcCost;
                                var fcIsHfuel = fuelCalcRows[fc].name === HFUEL_ITEM;
                                html += '<div class="calc-item-row">';
                                html += '<span class="calc-item-name calc-item-alt">' + escapeHtml(prettifyName(fuelCalcRows[fc].name));
                                if (fcIsHfuel) html += ' <span class="hfuel-half-tag">(\u00BD)</span>';
                                html += ' <span class="calc-item-qty">x' + formatNumber(fuelCalcRows[fc].quantity) + (bFactor < 1 ? ' <span class="calc-bonus-tag">(-' + Math.round((1-bFactor)*100) + '%)</span>' : '') + '</span></span>';
                                html += '<input type="number" class="calc-input" data-calc-price="' + recipeIdx + '" data-calc-key="' + fcKey + '" value="' + (fcPrice || '') + '" min="0" step="any" placeholder="0">';
                                html += '</div>';
                            }
                        } else {
                            var aKey = 'alt_' + j;
                            var aPrice = cd.prices[aKey] || 0;
                            var adjAltQty = Math.round(a.quantity * bFactor * mult);
                            var aLineCost = adjAltQty * aPrice;
                            totalCost += aLineCost;
                            var altNames = a.alternatives.map(function(x) { return prettifyName(x); }).join(' / ');
                            html += '<div class="calc-item-row">';
                            html += '<span class="calc-item-name calc-item-alt">' + escapeHtml(altNames) + ' <span class="calc-item-qty">x' + formatNumber(adjAltQty) + (bFactor < 1 ? ' <span class="calc-bonus-tag">(-' + Math.round((1-bFactor)*100) + '%)</span>' : '') + '</span></span>';
                            html += '<input type="number" class="calc-input" data-calc-price="' + recipeIdx + '" data-calc-key="' + aKey + '" value="' + (aPrice || '') + '" min="0" step="any" placeholder="0">';
                            html += '</div>';
                        }
                    }
                }
                html += '</div>';
            }

            // Produced items price inputs
            var totalRevenue = 0;
            if (hasProduced) {
                html += '<div class="calc-group-label">Sell Prices (produced per unit)</div>';
                html += '<div class="calc-item-rows">';
                for (var k = 0; k < recipe.producedItems.length; k++) {
                    var p = recipe.producedItems[k];
                    var pKey = 'sell_' + k;
                    var pPrice = cd.prices[pKey] || 0;
                    var pQty = Math.round(p.quantity * mult);
                    var lineRev = pQty * pPrice;
                    totalRevenue += lineRev;
                    html += '<div class="calc-item-row">';
                    html += '<span class="calc-item-name calc-item-prod">' + escapeHtml(prettifyName(p.item)) + ' <span class="calc-item-qty">x' + formatNumber(pQty) + '</span></span>';
                    html += '<input type="number" class="calc-input" data-calc-price="' + recipeIdx + '" data-calc-key="' + pKey + '" value="' + (pPrice || '') + '" min="0" step="any" placeholder="0">';
                    html += '</div>';
                }
                html += '</div>';
            }

            // Results
            var batchProfit = totalRevenue - totalCost;
            var marginPct = totalCost > 0 ? ((batchProfit / totalCost) * 100) : 0;
            var dCost = Math.round(totalCost);
            var dRevenue = Math.round(totalRevenue);
            var dProfit = Math.round(batchProfit);
            var profitCls = dProfit >= 0 ? 'calc-profit-pos' : 'calc-profit-neg';
            var marginStr = totalCost > 0 ? marginPct.toFixed(1) + '%' : '&mdash;';

            html += '<div class="calc-results" data-calc-results="' + recipeIdx + '">';
            html += calcResultsHTML(dCost, dRevenue, dProfit, profitCls, marginStr);
            html += '</div>';
            html += '<button class="calc-download-btn" data-download-idx="' + recipeIdx + '" title="Download as ODS spreadsheet">&#11015; Download ODS</button>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function calcResultsHTML(dCost, dRevenue, dProfit, profitCls, marginStr) {
        return '<div class="calc-row"><span>Total Cost</span><span class="calc-val-cost">$' + formatNumber(dCost) + '</span></div>' +
            '<div class="calc-row"><span>Total Revenue</span><span class="calc-val-rev">$' + formatNumber(dRevenue) + '</span></div>' +
            '<div class="calc-row calc-row-margin"><span>Margin</span><span class="' + profitCls + '">$' + formatNumber(dProfit) + ' (' + marginStr + ')</span></div>';
    }

    // Update calc results in-place (no re-render, keeps input focus)
    function updateCalcResults(idx) {
        var recipe = filteredRecipes[idx];
        if (!recipe) return;
        var cd = calcData[idx] || { prices: {} };
        var is24h = !!dailyModeCards[idx];
        var factionFilter = document.getElementById('faction-filter').value;
        var mult = 1;
        if (is24h && recipe.cookingRate) {
            var m24 = get24hMultiplier(recipe, factionFilter);
            if (m24 !== null) mult = m24;
        }
        var bonus = 1;
        if (factionFilter && factionFilter !== 'none' && recipe.affiliations) {
            for (var af = 0; af < recipe.affiliations.length; af++) {
                if (recipe.affiliations[af].faction === factionFilter) {
                    bonus = recipe.affiliations[af].bonus;
                    break;
                }
            }
        }
        var totalCost = 0;
        if (recipe.consumed) {
            for (var i = 0; i < recipe.consumed.length; i++) {
                totalCost += Math.round(recipe.consumed[i].quantity * bonus * mult) * (cd.prices['buy_' + i] || 0);
            }
        }
        if (recipe.consumedAlt) {
            for (var j = 0; j < recipe.consumedAlt.length; j++) {
                var altE = recipe.consumedAlt[j];
                var fuelR = getFuelAltDisplay(altE, bonus, mult);
                if (fuelR) {
                    for (var fci = 0; fci < fuelR.length; fci++) {
                        totalCost += fuelR[fci].quantity * (cd.prices['alt_' + j + '_' + fci] || 0);
                    }
                } else {
                    totalCost += Math.round(altE.quantity * bonus * mult) * (cd.prices['alt_' + j] || 0);
                }
            }
        }
        var totalRevenue = 0;
        if (recipe.producedItems) {
            for (var k = 0; k < recipe.producedItems.length; k++) {
                totalRevenue += Math.round(recipe.producedItems[k].quantity * mult) * (cd.prices['sell_' + k] || 0);
            }
        }
        var batchProfit = totalRevenue - totalCost;
        var marginPct = totalCost > 0 ? ((batchProfit / totalCost) * 100) : 0;
        var dCost = Math.round(totalCost);
        var dRevenue = Math.round(totalRevenue);
        var dProfit = Math.round(batchProfit);
        var profitCls = dProfit >= 0 ? 'calc-profit-pos' : 'calc-profit-neg';
        var marginStr = totalCost > 0 ? marginPct.toFixed(1) + '%' : '&mdash;';
        var el = document.querySelector('[data-calc-results="' + idx + '"]');
        if (!el) return;
        el.innerHTML = calcResultsHTML(dCost, dRevenue, dProfit, profitCls, marginStr);
    }

    // Render a single recipe card
    function renderRecipeCard(recipe, selectedFaction, recipeIdx) {
        var category = getCategory(recipe);
        var badgeClass = recipe.craftType ? 'craft' : (recipe.buildType ? 'build' : '');
        var is24h = !!dailyModeCards[recipeIdx];
        var mult = 1;
        var batchesIn24h = null;
        var has24hToggle = false;

        if (recipe.source !== 'modules' && recipe.cookingRate && recipe.cookingRate > 0) {
            var m24 = get24hMultiplier(recipe, selectedFaction);
            if (m24 !== null) {
                has24hToggle = true;
                batchesIn24h = m24;
                if (is24h) mult = m24;
            }
        }

        // Toggle button
        var toggleHTML = '';
        if (has24hToggle) {
            toggleHTML = '<div class="qty-toggle">';
            toggleHTML += '<button class="toggle-btn' + (!is24h ? ' active' : '') + '" data-idx="' + recipeIdx + '" data-mode="batch">Per Batch</button>';
            toggleHTML += '<button class="toggle-btn' + (is24h ? ' active' : '') + '" data-idx="' + recipeIdx + '" data-mode="daily">24 Hours</button>';
            toggleHTML += '</div>';
            if (is24h) {
                var details = calcCookingDetails(recipe, 1);
                var cookTime = details.adjustedTime !== null ? details.adjustedTime : details.baseTime;
                toggleHTML += '<div class="daily-info">' + formatNumber(Math.floor(batchesIn24h)) + ' batches &mdash; one every ' + formatTime(cookTime) + '</div>';
            }
        }

        // Compute affiliation bonus for materials & calculator
        var affiliationBonus = 1;
        if (selectedFaction && selectedFaction !== 'none' && recipe.affiliations) {
            for (var ab = 0; ab < recipe.affiliations.length; ab++) {
                if (recipe.affiliations[ab].faction === selectedFaction) {
                    affiliationBonus = recipe.affiliations[ab].bonus;
                    break;
                }
            }
        }

        var materialsHTML = '';
        if (recipe.consumed && recipe.consumed.length > 0) {
            materialsHTML += '<table class="materials-table"><thead><tr><th>Material</th><th style="text-align:right">Quantity</th></tr></thead><tbody>';
            for (var i = 0; i < recipe.consumed.length; i++) {
                var c = recipe.consumed[i];
                var adjQty = Math.floor(c.quantity * affiliationBonus * mult);
                materialsHTML += '<tr><td class="item-name">' + escapeHtml(prettifyName(c.item)) + '</td>' +
                    '<td class="item-qty">' + formatNumber(adjQty) + '</td></tr>';
            }
            materialsHTML += '</tbody></table>';
        }

        // Dynamic alternatives
        var altHTML = '';
        if (recipe.consumedAlt && recipe.consumedAlt.length > 0) {
            altHTML = '<table class="materials-table"><thead><tr><th>Alternative Materials (pick one)</th><th style="text-align:right">Qty</th></tr></thead><tbody>';
            for (var j = 0; j < recipe.consumedAlt.length; j++) {
                var a = recipe.consumedAlt[j];
                var fuelRows = getFuelAltDisplay(a, affiliationBonus, mult);
                if (fuelRows) {
                    for (var fr = 0; fr < fuelRows.length; fr++) {
                        var isHfuel = fuelRows[fr].name === HFUEL_ITEM;
                        altHTML += '<tr><td class="item-alt">' + escapeHtml(prettifyName(fuelRows[fr].name));
                        if (isHfuel) altHTML += ' <span class="hfuel-half-tag">(\u00BD)</span>';
                        altHTML += '</td><td class="item-qty">' + formatNumber(fuelRows[fr].quantity) + '</td></tr>';
                    }
                } else {
                    var names = a.alternatives.map(function(x) { return prettifyName(x); }).join(' OR ');
                    var adjAltQty = Math.floor(a.quantity * affiliationBonus * mult);
                    altHTML += '<tr><td class="item-alt">' + escapeHtml(names) + '</td>' +
                        '<td class="item-qty">' + formatNumber(adjAltQty) + '</td></tr>';
                }
            }
            altHTML += '</tbody></table>';
        }

        // Catalysts (not consumed, show per batch always)
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

        // Profit calculator section (not for modules)
        var calcSectionHTML = recipe.source !== 'modules' ? renderCalcSection(recipe, recipeIdx, mult, affiliationBonus) : '';

        return '<div class="recipe-card" data-idx="' + recipeIdx + '">' +
            '<div class="recipe-header">' +
                '<span class="recipe-name">' + escapeHtml(recipe.infotext) + '</span>' +
                '<span class="recipe-badge ' + badgeClass + '">' + escapeHtml(category) + '</span>' +
            '</div>' +
            '<div class="recipe-meta">' +
                renderProducedItems(recipe, mult) +
                extraMeta +
            '</div>' +
            cookingSectionHTML +
            toggleHTML +
            materialsHTML + altHTML + catalystHTML +
            calcSectionHTML +
            producedHTML + affHTML +
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

            // Affiliation-only filter
            var factionOnlyChk = document.getElementById('faction-only-filter');
            if (factionFilter && factionFilter !== 'none' && factionOnlyChk && factionOnlyChk.checked) {
                if (!r.affiliations || !r.affiliations.some(function(a) { return a.faction === factionFilter; })) return false;
            }

            // Restricted recipes: only show when a faction with a listed bonus is selected
            if (r.restricted) {
                if (!factionFilter || factionFilter === 'none') return false;
                if (!r.affiliations || !r.affiliations.some(function(a) { return a.faction === factionFilter; })) return false;
            }

            return true;
        });

        var container = document.getElementById('recipe-list');
        if (filteredRecipes.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:3rem;">No recipes match your filters.</p>';
        } else {
            var html = [];
            for (var i = 0; i < filteredRecipes.length; i++) {
                html.push(renderRecipeCard(filteredRecipes[i], factionFilter, i));
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

        // Build faction entries list for autocomplete
        if (siteData.factions) {
            var entries = [];
            for (var key in siteData.factions) {
                if (siteData.factions.hasOwnProperty(key)) {
                    entries.push([key, siteData.factions[key]]);
                }
            }
            entries.sort(function(a, b) { return a[1].localeCompare(b[1]); });
            siteData._factionEntries = entries;
        } else {
            siteData._factionEntries = [];
        }

        document.getElementById('total-count').textContent = siteData.recipes.length;
    }

    // Generate ODS (OpenDocument Spreadsheet) file for a recipe calculation
    function generateODS(recipeIdx) {
        var recipe = filteredRecipes[recipeIdx];
        if (!recipe) return;
        var cd = calcData[recipeIdx] || { prices: {} };
        var factionFilter = document.getElementById('faction-filter').value;
        var is24h = !!dailyModeCards[recipeIdx];
        var mult = 1;
        if (is24h && recipe.cookingRate) {
            var m24 = get24hMultiplier(recipe, factionFilter);
            if (m24 !== null) mult = m24;
        }
        var bonus = 1;
        if (factionFilter && factionFilter !== 'none' && recipe.affiliations) {
            for (var af = 0; af < recipe.affiliations.length; af++) {
                if (recipe.affiliations[af].faction === factionFilter) {
                    bonus = recipe.affiliations[af].bonus;
                    break;
                }
            }
        }

        // Build rows: [name, qty, price, lineTotal]
        var consumedRows = [];
        var producedRows = [];

        if (recipe.consumed) {
            for (var i = 0; i < recipe.consumed.length; i++) {
                var c = recipe.consumed[i];
                var qty = Math.round(c.quantity * bonus * mult);
                var price = cd.prices['buy_' + i] || 0;
                consumedRows.push([prettifyName(c.item), qty, price, qty * price]);
            }
        }
        if (recipe.consumedAlt) {
            for (var j = 0; j < recipe.consumedAlt.length; j++) {
                var a = recipe.consumedAlt[j];
                var fuelR = getFuelAltDisplay(a, bonus, mult);
                if (fuelR) {
                    for (var fci = 0; fci < fuelR.length; fci++) {
                        var fp = cd.prices['alt_' + j + '_' + fci] || 0;
                        consumedRows.push([prettifyName(fuelR[fci].name), fuelR[fci].quantity, fp, fuelR[fci].quantity * fp]);
                    }
                } else {
                    var aq = Math.round(a.quantity * bonus * mult);
                    var ap = cd.prices['alt_' + j] || 0;
                    var altLabel = a.alternatives.map(function(x) { return prettifyName(x); }).join(' / ');
                    consumedRows.push([altLabel, aq, ap, aq * ap]);
                }
            }
        }
        if (recipe.producedItems) {
            for (var k = 0; k < recipe.producedItems.length; k++) {
                var p = recipe.producedItems[k];
                var pq = Math.round(p.quantity * mult);
                var pp = cd.prices['sell_' + k] || 0;
                producedRows.push([prettifyName(p.item), pq, pp, pq * pp]);
            }
        }

        var totalCost = consumedRows.reduce(function(s, r) { return s + r[3]; }, 0);
        var totalRevenue = producedRows.reduce(function(s, r) { return s + r[3]; }, 0);
        var profit = totalRevenue - totalCost;

        // Build ODS XML content
        function xmlEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
        function textCell(v) { return '<table:table-cell office:value-type="string"><text:p>' + xmlEsc(v) + '</text:p></table:table-cell>'; }
        function numCell(v) { return '<table:table-cell office:value-type="float" office:value="' + v + '"><text:p>' + v + '</text:p></table:table-cell>'; }
        function emptyCell() { return '<table:table-cell/>'; }

        var rows = [];
        // Title
        rows.push('<table:table-row>' + textCell(recipe.infotext + (is24h ? ' (24h)' : ' (per batch)')) + emptyCell() + emptyCell() + emptyCell() + '</table:table-row>');
        rows.push('<table:table-row>' + emptyCell() + emptyCell() + emptyCell() + emptyCell() + '</table:table-row>');

        // Consumed header
        rows.push('<table:table-row>' + textCell('Consumed Materials') + textCell('Quantity') + textCell('Price Each') + textCell('Line Total') + '</table:table-row>');
        for (var ci = 0; ci < consumedRows.length; ci++) {
            rows.push('<table:table-row>' + textCell(consumedRows[ci][0]) + numCell(consumedRows[ci][1]) + numCell(consumedRows[ci][2]) + numCell(consumedRows[ci][3]) + '</table:table-row>');
        }
        rows.push('<table:table-row>' + emptyCell() + emptyCell() + emptyCell() + emptyCell() + '</table:table-row>');

        // Produced header
        rows.push('<table:table-row>' + textCell('Produced Items') + textCell('Quantity') + textCell('Price Each') + textCell('Line Total') + '</table:table-row>');
        for (var pi = 0; pi < producedRows.length; pi++) {
            rows.push('<table:table-row>' + textCell(producedRows[pi][0]) + numCell(producedRows[pi][1]) + numCell(producedRows[pi][2]) + numCell(producedRows[pi][3]) + '</table:table-row>');
        }
        rows.push('<table:table-row>' + emptyCell() + emptyCell() + emptyCell() + emptyCell() + '</table:table-row>');

        // Summary
        rows.push('<table:table-row>' + textCell('Total Cost') + emptyCell() + emptyCell() + numCell(Math.round(totalCost)) + '</table:table-row>');
        rows.push('<table:table-row>' + textCell('Total Revenue') + emptyCell() + emptyCell() + numCell(Math.round(totalRevenue)) + '</table:table-row>');
        rows.push('<table:table-row>' + textCell('Profit') + emptyCell() + emptyCell() + numCell(Math.round(profit)) + '</table:table-row>');
        if (totalCost > 0) {
            rows.push('<table:table-row>' + textCell('Margin') + emptyCell() + emptyCell() + textCell(((profit / totalCost) * 100).toFixed(1) + '%') + '</table:table-row>');
        }

        var contentXml = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
            'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
            'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
            'office:version="1.2">' +
            '<office:body><office:spreadsheet>' +
            '<table:table table:name="Calculation">' +
            '<table:table-column table:number-columns-repeated="4"/>' +
            rows.join('') +
            '</table:table>' +
            '</office:spreadsheet></office:body></office:document-content>';

        var metaXml = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
            'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">' +
            '<office:meta><meta:generator>DiscoveryRecipeCalculator</meta:generator></office:meta>' +
            '</office:document-meta>';

        var stylesXml = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">' +
            '</office:document-styles>';

        var manifestXml = '<?xml version="1.0" encoding="UTF-8"?>' +
            '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">' +
            '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>' +
            '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
            '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>' +
            '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
            '</manifest:manifest>';

        var mimetypeStr = 'application/vnd.oasis.opendocument.spreadsheet';

        // Build ZIP using minimal ZIP creation (no library needed)
        var zip = buildOdsZip(mimetypeStr, contentXml, metaXml, stylesXml, manifestXml);
        var blob = new Blob([zip], { type: 'application/vnd.oasis.opendocument.spreadsheet' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = (recipe.infotext || 'calculation').replace(/[^a-zA-Z0-9_ -]/g, '') + '.ods';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // Minimal ZIP builder for ODS files
    function buildOdsZip(mimetype, contentXml, metaXml, stylesXml, manifestXml) {
        var files = [
            { name: 'mimetype', data: strToU8(mimetype), compress: false },
            { name: 'content.xml', data: strToU8(contentXml), compress: false },
            { name: 'meta.xml', data: strToU8(metaXml), compress: false },
            { name: 'styles.xml', data: strToU8(stylesXml), compress: false },
            { name: 'META-INF/manifest.xml', data: strToU8(manifestXml), compress: false }
        ];

        var localHeaders = [];
        var centralHeaders = [];
        var offset = 0;

        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var nameBytes = strToU8(f.name);
            var crc = crc32(f.data);
            var localHeader = new Uint8Array(30 + nameBytes.length + f.data.length);
            var dv = new DataView(localHeader.buffer);
            dv.setUint32(0, 0x04034b50, true); // local file header sig
            dv.setUint16(4, 20, true); // version needed
            dv.setUint16(6, 0, true); // flags
            dv.setUint16(8, 0, true); // compression: stored
            dv.setUint16(10, 0, true); // mod time
            dv.setUint16(12, 0, true); // mod date
            dv.setUint32(14, crc, true); // crc-32
            dv.setUint32(18, f.data.length, true); // compressed size
            dv.setUint32(22, f.data.length, true); // uncompressed size
            dv.setUint16(26, nameBytes.length, true); // file name length
            dv.setUint16(28, 0, true); // extra field length
            localHeader.set(nameBytes, 30);
            localHeader.set(f.data, 30 + nameBytes.length);
            localHeaders.push(localHeader);

            // Central directory entry
            var central = new Uint8Array(46 + nameBytes.length);
            var cdv = new DataView(central.buffer);
            cdv.setUint32(0, 0x02014b50, true); // central dir sig
            cdv.setUint16(4, 20, true); // version made by
            cdv.setUint16(6, 20, true); // version needed
            cdv.setUint16(8, 0, true); // flags
            cdv.setUint16(10, 0, true); // compression
            cdv.setUint16(12, 0, true); // mod time
            cdv.setUint16(14, 0, true); // mod date
            cdv.setUint32(16, crc, true);
            cdv.setUint32(20, f.data.length, true);
            cdv.setUint32(24, f.data.length, true);
            cdv.setUint16(28, nameBytes.length, true);
            cdv.setUint16(30, 0, true); // extra length
            cdv.setUint16(32, 0, true); // comment length
            cdv.setUint16(34, 0, true); // disk
            cdv.setUint16(36, 0, true); // internal attrs
            cdv.setUint32(38, 0, true); // external attrs
            cdv.setUint32(42, offset, true); // local header offset
            central.set(nameBytes, 46);
            centralHeaders.push(central);

            offset += localHeader.length;
        }

        var centralSize = centralHeaders.reduce(function(s, c) { return s + c.length; }, 0);
        var eocd = new Uint8Array(22);
        var edv = new DataView(eocd.buffer);
        edv.setUint32(0, 0x06054b50, true); // end of central dir sig
        edv.setUint16(4, 0, true); // disk
        edv.setUint16(6, 0, true); // disk with central dir
        edv.setUint16(8, files.length, true); // entries on disk
        edv.setUint16(10, files.length, true); // total entries
        edv.setUint32(12, centralSize, true); // central dir size
        edv.setUint32(16, offset, true); // central dir offset
        edv.setUint16(20, 0, true); // comment length

        var totalLen = offset + centralSize + 22;
        var result = new Uint8Array(totalLen);
        var pos = 0;
        for (var li = 0; li < localHeaders.length; li++) {
            result.set(localHeaders[li], pos);
            pos += localHeaders[li].length;
        }
        for (var ci = 0; ci < centralHeaders.length; ci++) {
            result.set(centralHeaders[ci], pos);
            pos += centralHeaders[ci].length;
        }
        result.set(eocd, pos);
        return result;
    }

    function strToU8(str) {
        var encoder = new TextEncoder();
        return encoder.encode(str);
    }

    function crc32(data) {
        var table = crc32.table;
        if (!table) {
            table = new Uint32Array(256);
            for (var i = 0; i < 256; i++) {
                var c = i;
                for (var j = 0; j < 8; j++) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[i] = c;
            }
            crc32.table = table;
        }
        var crc = 0xFFFFFFFF;
        for (var k = 0; k < data.length; k++) {
            crc = table[(crc ^ data[k]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
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
                // Faction autocomplete
                (function() {
                    var fInput = document.getElementById('faction-search');
                    var fHidden = document.getElementById('faction-filter');
                    var fDropdown = document.getElementById('faction-dropdown');
                    var fClear = document.getElementById('faction-clear');
                    var fLabel = document.getElementById('faction-only-label');
                    var hlIdx = -1;

                    function getFiltered(term) {
                        var all = siteData._factionEntries || [];
                        if (!term) return all;
                        var lower = term.toLowerCase();
                        return all.filter(function(e) { return e[1].toLowerCase().indexOf(lower) !== -1; });
                    }

                    function renderDropdown(items) {
                        hlIdx = -1;
                        if (items.length === 0) {
                            fDropdown.innerHTML = '<div class="faction-dropdown-empty">No factions found</div>';
                        } else {
                            fDropdown.innerHTML = items.map(function(e, i) {
                                return '<div class="faction-dropdown-item" data-fkey="' + e[0] + '" data-idx="' + i + '">' + escapeHtml(e[1]) + '</div>';
                            }).join('');
                        }
                        fDropdown.classList.add('open');
                    }

                    function selectFaction(key, name) {
                        fHidden.value = key;
                        fInput.value = name;
                        fDropdown.classList.remove('open');
                        fClear.style.display = '';
                        fLabel.style.display = (key && key !== 'none') ? '' : 'none';
                        applyFilters();
                    }

                    function clearFaction() {
                        fHidden.value = 'none';
                        fInput.value = '';
                        fClear.style.display = 'none';
                        fDropdown.classList.remove('open');
                        fLabel.style.display = 'none';
                        document.getElementById('faction-only-filter').checked = false;
                        applyFilters();
                    }

                    fInput.addEventListener('focus', function() {
                        renderDropdown(getFiltered(fInput.value));
                    });

                    fInput.addEventListener('input', function() {
                        if (fHidden.value !== 'none') {
                            fHidden.value = 'none';
                            fClear.style.display = 'none';
                            fLabel.style.display = 'none';
                            applyFilters();
                        }
                        renderDropdown(getFiltered(fInput.value));
                    });

                    fInput.addEventListener('keydown', function(e) {
                        var items = fDropdown.querySelectorAll('.faction-dropdown-item');
                        if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            hlIdx = Math.min(hlIdx + 1, items.length - 1);
                            items.forEach(function(el, i) { el.classList.toggle('highlighted', i === hlIdx); });
                        } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            hlIdx = Math.max(hlIdx - 1, 0);
                            items.forEach(function(el, i) { el.classList.toggle('highlighted', i === hlIdx); });
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (hlIdx >= 0 && hlIdx < items.length) {
                                selectFaction(items[hlIdx].getAttribute('data-fkey'), items[hlIdx].textContent);
                            }
                        } else if (e.key === 'Escape') {
                            fDropdown.classList.remove('open');
                            fInput.blur();
                        }
                    });

                    fDropdown.addEventListener('mousedown', function(e) {
                        var item = e.target.closest('.faction-dropdown-item');
                        if (item) {
                            e.preventDefault();
                            selectFaction(item.getAttribute('data-fkey'), item.textContent);
                        }
                    });

                    fClear.addEventListener('click', clearFaction);

                    document.addEventListener('click', function(e) {
                        if (!e.target.closest('.faction-autocomplete')) {
                            fDropdown.classList.remove('open');
                        }
                    });
                })();
                document.getElementById('faction-only-filter').addEventListener('change', applyFilters);
                document.getElementById('hfuel-half-toggle').addEventListener('change', function() {
                    hFuelHalf = this.checked;
                    applyFilters();
                });

                // Toggle button delegation
                document.getElementById('recipe-list').addEventListener('click', function(e) {
                    var btn = e.target.closest('.toggle-btn');
                    if (!btn) return;
                    var idx = parseInt(btn.getAttribute('data-idx'), 10);
                    var mode = btn.getAttribute('data-mode');
                    dailyModeCards[idx] = (mode === 'daily');
                    // Re-render just that card
                    var factionFilter = document.getElementById('faction-filter').value;
                    var cardEl = document.querySelector('.recipe-card[data-idx="' + idx + '"]');
                    if (cardEl) {
                        var tmp = document.createElement('div');
                        tmp.innerHTML = renderRecipeCard(filteredRecipes[idx], factionFilter, idx);
                        cardEl.replaceWith(tmp.firstChild);
                    }
                });

                // Calculator toggle delegation
                document.getElementById('recipe-list').addEventListener('click', function(e) {
                    var calcBtn = e.target.closest('.calc-toggle-btn');
                    if (!calcBtn) return;
                    var idx = parseInt(calcBtn.getAttribute('data-calc-idx'), 10);
                    if (!calcData[idx]) calcData[idx] = { prices: {}, open: false };
                    calcData[idx].open = !calcData[idx].open;
                    var factionFilter = document.getElementById('faction-filter').value;
                    var cardEl = document.querySelector('.recipe-card[data-idx="' + idx + '"]');
                    if (cardEl) {
                        var tmp = document.createElement('div');
                        tmp.innerHTML = renderRecipeCard(filteredRecipes[idx], factionFilter, idx);
                        cardEl.replaceWith(tmp.firstChild);
                        if (calcData[idx].open) {
                            var newCard = document.querySelector('.recipe-card[data-idx="' + idx + '"]');
                            var fi = newCard && newCard.querySelector('.calc-input');
                            if (fi) fi.focus();
                        }
                    }
                });

                // Calculator per-item price input real-time update
                document.getElementById('recipe-list').addEventListener('input', function(e) {
                    var inp = e.target.closest('.calc-input');
                    if (!inp) return;
                    var idxAttr = inp.getAttribute('data-calc-price');
                    if (idxAttr === null) return;
                    var idx = parseInt(idxAttr, 10);
                    var key = inp.getAttribute('data-calc-key');
                    if (!calcData[idx]) calcData[idx] = { prices: {}, open: true };
                    calcData[idx].prices[key] = parseFloat(inp.value) || 0;
                    updateCalcResults(idx);
                });

                // ODS download button delegation
                document.getElementById('recipe-list').addEventListener('click', function(e) {
                    var dlBtn = e.target.closest('.calc-download-btn');
                    if (!dlBtn) return;
                    var idx = parseInt(dlBtn.getAttribute('data-download-idx'), 10);
                    generateODS(idx);
                });
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
