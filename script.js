const ENCHANTMENT_LIMIT_INCLUSIVE = 10;

let worker;
let start_time;
let total_steps;
let total_tries;
let languageJson;
let languageId;
let enchants_list;

const languages = {
    'en': { name: 'English', code: 'us' },
    'de': { name: 'Deutsch', code: 'de' },
    'es-ES': { name: 'Español', code: 'es' },
    'fr-FR': { name: 'Français', code: 'fr' },
    'it-IT': { name: 'Italiano', code: 'it' },
    'id': { name: 'Indonesia', code: 'id' },
    'hu-HU': { name: 'Magyar', code: 'hu' },
    'nl': { name: 'Nederlands', code: 'nl' },
    'pl-PL': { name: 'Polski', code: 'pl' },
    'pt-BR': { name: 'Português', code: 'br' },
    'vi-VN': { name: 'Tiếng Việt', code: 'vn' },
    'tr-TR': { name: 'Türkçe', code: 'tr' },
    'be-BY': { name: 'Беларуская', code: 'by' },
    'ru-RU': { name: 'Русский', code: 'ru' },
    'ua-UA': { name: 'Українська', code: 'ua' },
    'th-TH': { name: 'ภาษาไทย', code: 'th' },
    'zh-CN': { name: '简体中文', code: 'cn' },
    'zh-TW': { name: '繁體中文', code: 'tw' },
    'ja-JP': { name: '日本語', code: 'jp' },
    'ko-KR': { name: '한국어', code: 'kr' },
    'ar': { name: 'اَلْعَرَبِيَّةُ', code: 'sa' }
};

const languages_cache_key = 6;

// Theme is now initialized via head script to prevent flash

window.onload = function () {

    worker = new Worker("work.js?6");
    worker.onmessage = function (event) {
        if (event.data.msg === "complete") {
            afterFoundOptimalSolution(event.data);
        }
    };
    worker.postMessage({
        msg: "set_data",
        data: data
    });

    setupLanguage();
    buildItemSelection();
    buildStartingPenaltySelection();
    buildEnchantmentSelection();
    buildCalculateButton();
    buildFilters();
    setupBackgroundImage();
};

function buildCalculateButton() {
    $("#calculate").click(calculate);
}

function buildFilters() {
    $("#allow_incompatible").change(allowIncompatibleChanged);
    $("#allow_many").change(allowManyChanged);
}

let itemDropdown;
function buildItemSelection() {
    const itemOptions = [
        { value: "", label: "Choose an item to enchant" }
    ];
    data.items.forEach(item_namespace => {
        itemOptions.push({ value: item_namespace, label: item_namespace });
    });

    itemDropdown = createCustomDropdown(
        itemOptions,
        $('#left p:first'),
        $('#item'),
        function (val) {
            if (!val) return '';
            return `<img src="./images/${val}.gif" class="icon" alt="">`;
        },
        function (val) {
            $('#item').val(val).change();
        }
    );
}

function createCustomDropdown(options, $targetContainer, $nativeSelect, getIconHtml, onSelect) {
    const wrapper = $('<div class="custom-dropdown-wrapper"></div>');
    const selected = $('<div class="custom-dropdown-selected"></div>');
    selected.append('<span class="icon-container"></span>');
    selected.append('<span class="text"></span>');
    selected.append('<span class="arrow"></span>');

    const optionsCont = $('<div class="custom-dropdown-options"></div>');

    options.forEach(opt => {
        if (opt.value === "") return; // Don't show empty/placeholder in the dropdown menu

        const item = $('<div class="custom-dropdown-option"></div>');
        item.attr('data-value', opt.value);
        item.append(`<span class="icon-container">${getIconHtml(opt.value)}</span>`);
        item.append(`<span class="text">${opt.label}</span>`);

        item.on('click', function () {
            onSelect(opt.value);
            $nativeSelect.val(opt.value).change();
            wrapper.removeClass('open');
        });

        optionsCont.append(item);
    });

    selected.on('click', function (e) {
        e.stopPropagation();
        const isOpen = wrapper.hasClass('open');
        $('.custom-dropdown-wrapper').removeClass('open');
        if (!isOpen) wrapper.addClass('open');
    });

    $(document).on('click', function () {
        wrapper.removeClass('open');
    });

    wrapper.append(selected).append(optionsCont);
    $targetContainer.append(wrapper);

    const dropdown = {
        updateOptionLabel: function (value, newLabel) {
            optionsCont.find(`.custom-dropdown-option[data-value="${value}"] .text`).text(newLabel);
            if ($nativeSelect.val() === value) {
                selected.find('.text').text(newLabel);
            }
        },
        updateSelection: function (value, label) {
            const iconHtml = getIconHtml(value);
            const iconContainer = selected.find('.icon-container');
            if (iconHtml) {
                iconContainer.html(iconHtml).show();
            } else {
                iconContainer.hide();
            }
            selected.find('.text').text(label);
            optionsCont.find(`.custom-dropdown-option`).removeClass('selected');
            optionsCont.find(`.custom-dropdown-option[data-value="${value}"]`).addClass('selected');
        }
    };

    // Initial state
    const initialVal = $nativeSelect.val() || options[0].value;
    const initialLabel = options.find(o => o.value === initialVal)?.label || options[0].label;
    dropdown.updateSelection(initialVal, initialLabel);

    return dropdown;
}


let penaltyDropdown;
function buildStartingPenaltySelection() {
    const penaltyOptions = [
        { value: "0", label: "0 (New)" },
        { value: "1", label: "1" },
        { value: "2", label: "2" },
        { value: "3", label: "3" },
        { value: "4", label: "4" },
        { value: "5", label: "5" },
        { value: "6", label: "6+" }
    ];
    penaltyDropdown = createCustomDropdown(
        penaltyOptions,
        $('#anvil-penalty-label').parent(),
        $('#starting-penalty'),
        function (val) {
            return `<img src="./images/down.png" class="icon" style="filter: brightness(0.5) invert(1);" alt="">`;
        },
        function (val) {
            // No extra action needed
        }
    );
}

function incompatibleGroupFromNamespace(enchantment_namespace) {
    const enchantments_metadata = data.enchants;

    const incompatible_namespaces_queue = [enchantment_namespace];
    const incompatible_namespaces = [];

    while (incompatible_namespaces_queue.length) {
        const incompatible_namespace = incompatible_namespaces_queue.shift();
        const incompatible_already_grouped = incompatible_namespaces.includes(incompatible_namespace);

        if (!incompatible_already_grouped) {
            incompatible_namespaces.push(incompatible_namespace);
            const enchantment_metadata = enchantments_metadata[incompatible_namespace];
            const new_incompatible_namespaces = enchantment_metadata.incompatible;

            new_incompatible_namespaces.forEach(new_incompatible_namespace => {
                const new_incompatible_already_grouped = incompatible_namespaces.includes(new_incompatible_namespace);
                const new_incompatible_in_queue = incompatible_namespaces_queue.includes(new_incompatible_namespace);
                const push_new_incompatible = !new_incompatible_already_grouped && !new_incompatible_in_queue;
                if (push_new_incompatible) {
                    incompatible_namespaces_queue.push(new_incompatible_namespace);
                }
            });
        }
    }

    incompatible_namespaces.sort();
    return incompatible_namespaces;
}

function buildEnchantList(item_namespace_chosen) {
    const enchantments_metadata = data.enchants;

    $("#enchants table").html("");

    const item_enchantment_namespaces = [];
    let enchantment_level_maxmax = 0;

    const enchantment_namespaces = Object.keys(enchantments_metadata);
    enchantment_namespaces.forEach(enchantment_namespace => {

        const enchantment_metadata = enchantments_metadata[enchantment_namespace];
        const item_namespaces = enchantment_metadata.items;

        let allow_enchantment = false;
        if (item_namespace_chosen === "book") {
            allow_enchantment = true;
        } else {
            item_namespaces.forEach(item_namespace => {
                if (item_namespace === item_namespace_chosen) {
                    allow_enchantment = true;
                }
            });
        }

        if (allow_enchantment) {
            const enchantment_max_level = enchantment_metadata.levelMax;
            enchantment_level_maxmax = Math.max(enchantment_level_maxmax, enchantment_max_level);
            item_enchantment_namespaces.push(enchantment_namespace);
        }
    });

    const enchantment_groups = [];
    const enchantments_grouped = [];

    function filterEnchantmentGroup(enchantment_namespace) {
        return item_enchantment_namespaces.includes(enchantment_namespace);
    }

    item_enchantment_namespaces.forEach(enchantment_namespace => {
        const namespace_already_grouped = enchantments_grouped.includes(enchantment_namespace);
        if (namespace_already_grouped) return;

        let enchantment_group = incompatibleGroupFromNamespace(enchantment_namespace);
        enchantment_group = enchantment_group.filter(filterEnchantmentGroup);

        enchantment_group.forEach(enchantment_namespace => {
            const enchantment_already_grouped = enchantments_grouped.includes(enchantment_namespace);
            if (!enchantment_already_grouped) {
                enchantments_grouped.push(enchantment_namespace);
            }
        });

        enchantment_groups.push(enchantment_group);
    });

    let group_toggle_color = true;

    enchantment_groups.forEach(enchantment_group => {
        enchantment_group.forEach(enchantment_namespace => {
            const enchantment_metadata = enchantments_metadata[enchantment_namespace];
            const enchantment_max_level = enchantment_metadata.levelMax;
            const enchantment_name = languageJson.enchants[enchantment_namespace];

            const enchantment_row = $("<tr>");
            enchantment_row.addClass(group_toggle_color ? "group1" : "group2");
            enchantment_row.append($("<td>").append(enchantment_name));
            for (let enchantment_level = 1; enchantment_level <= enchantment_level_maxmax; enchantment_level++) {
                if (enchantment_max_level >= enchantment_level) {
                    const enchantment_button_data = {
                        level: enchantment_level,
                        enchant: enchantment_name
                    };
                    const enchantment_button = $("<button>");
                    enchantment_button.append(enchantment_level);
                    enchantment_button.addClass("off");
                    enchantment_button.addClass("level-button");
                    enchantment_button.data(enchantment_button_data);

                    const enchantment_row_append = $("<td>").append(enchantment_button);
                    enchantment_row.append(enchantment_row_append);
                } else {
                    enchantment_row.append($("<td>"));
                }
            }
            $("#enchants table").append(enchantment_row);
            group_toggle_color = !group_toggle_color;
        });
    });

    $("#starting-enchants").html("");
    if (item_namespace_chosen !== "book") {
        item_enchantment_namespaces.forEach(enchantment_namespace => {
            const enchantment_metadata = enchantments_metadata[enchantment_namespace];
            const enchantment_max_level = enchantment_metadata.levelMax;
            const enchantment_name = languageJson.enchants[enchantment_namespace];

            const container = $("<div style='display: flex; align-items: center; gap: 4px; margin-bottom: 2px;'/>");

            const checkbox = $('<input type="checkbox" class="starting-enchant-checkbox">');
            checkbox.attr("id", "start-en-" + enchantment_namespace);
            checkbox.data("ns", enchantment_namespace);

            const label = $("<label style='cursor:pointer; white-space: nowrap;'/>");
            label.attr("for", "start-en-" + enchantment_namespace);
            label.text(enchantment_name + " ");

            container.append(checkbox).append(label);

            if (enchantment_max_level > 1) {
                const level_select = $('<select class="starting-enchant-level" style="padding: 0 2px; font-size: 0.8rem;">');
                for (let l = 1; l <= enchantment_max_level; l++) {
                    $("<option/>", { value: l }).text(l).appendTo(level_select);
                }
                level_select.val(enchantment_max_level);
                container.append(level_select);
            }
            $("#starting-enchants").append(container);
        });
        $("#starting-state").show();
    } else {
        $("#starting-state").hide();
    }

    $("#enchants").show();
    updateCalculateButtonState();
}

function doAllowIncompatibleEnchantments() {
    const allow_incompatible_checkbox = $("#allow_incompatible");
    return allow_incompatible_checkbox.is(":checked");
}

function doAllowManyEnchantments() {
    const allow_many_checkbox = $("#allow_many");
    return allow_many_checkbox.is(":checked");
}

function allowIncompatibleChanged() {
    const allow_incompatible = doAllowIncompatibleEnchantments();
    if (!allow_incompatible) {
        turnOffLevelButtons();
    }
}

function allowManyChanged() {
    const allow_many = doAllowManyEnchantments();
    if (!allow_many) {
        turnOffLevelButtons();
    }
}

function turnOffLevelButtons() {
    const enchantment_buttons = $(".level-button");
    turnOffButtons(enchantment_buttons);
}

function buildEnchantmentSelection() {
    $("select#item").change(function () {
        const item_namespace_selected = $("select#item option:selected").val();
        if (item_namespace_selected) {
            buildEnchantList(item_namespace_selected);
            $("#overrides").show();
        } else {
            $("#enchants").hide();
            $("#overrides").hide();
            $("#starting-state").hide();
        }
    });

    $("#enchants table").on("click", "button", function () {
        levelButtonClicked($(this));
    });
}

function displayTime(time_milliseconds) {
    let time_text;

    if (time_milliseconds < 1) {
        const time_microseconds = Math.round(time_milliseconds * 1000);
        time_text = Math.round(time_microseconds) + languageJson.microseconds;
    } else if (time_milliseconds < 1000) {
        const time_round = Math.round(time_milliseconds);
        time_text = pluralize(time_round, 'millisecond');
    } else {
        const time_seconds = Math.round(time_milliseconds / 1000);
        time_text = pluralize(time_seconds, 'second');
    }

    return time_text;
}

function displayLevelsText(levels) {
    let level_text;
    level_text = pluralize(levels, 'level');
    return level_text;
}

function pluralize(num, key_root) {

    if (languageJson.use_russian_plurals) {
        if ((num % 10 === 1) && (num < 10 || num > 15)) {
            return String(num) + languageJson[key_root];
        } else if ((num % 10 === 2 || num % 10 === 3 || num % 10 === 4) && (num < 10 || num > 15)) {
            return String(num) + languageJson[key_root + '_low'];
        } else {
            return String(num) + languageJson[key_root + '_high'];
        }
    }

    if (num === 1) {
        return String(num) + languageJson[key_root];
    } else {
        return String(num) + languageJson[key_root + '_s'];
    }
}

function displayXpText(xp, minimum_xp = -1) {
    let xp_text = "";
    if (minimum_xp >= 0) {
        xp_text += commaify(minimum_xp) + "-";
    }
    xp_text += commaify(xp) + languageJson.xp;
    return xp_text;
}

function commaify(n) {
    let out = "";
    let nstr = "" + n;
    while (nstr.length > 3) {
        out = "," + nstr.substr(nstr.length - 3) + out;
        nstr = nstr.substr(0, nstr.length - 3);
    }
    return nstr + out;
}

function displayLevelXpText(levels, xp, minimum_xp = -1) {
    const level_text = displayLevelsText(levels);
    const xp_text = displayXpText(xp, minimum_xp);
    return level_text + " (" + xp_text + ")";
}

function displayInstructionText(instruction) {
    const left_item_obj = instruction[0];
    const right_item_obj = instruction[1];
    const levels = instruction[2];
    const xp = instruction[3]
    const work = instruction[4];

    const left_item_text = displayItemText(left_item_obj);
    const right_item_text = displayItemText(right_item_obj);

    const instruction_text = languageJson.combine + " <i>" + left_item_text + "</i> " + languageJson.with + " <i>" + right_item_text + "</i>";
    const cost_text = languageJson.cost + displayLevelXpText(levels, xp);
    const prior_work_text = languageJson.prior_work_penalty + displayLevelsText(work);

    return instruction_text + "<br><small>" + cost_text + ", " + prior_work_text + "</small>";
}

function displayEnchantmentsText(enchants) {
    let count = enchants.length

    let text = "";
    if (count >= 1) text += "(";
    enchants.forEach((enchant, index) => {
        if (languageJson.enchants.hasOwnProperty(enchant)) {
            text += languageJson.enchants[enchant];
            if (data.enchants[enchant].levelMax > 1) {
                text += ' ' + enchants_list.find(([entry]) => entry === enchant)[1]
            }

            if (index !== count - 1) text += ", ";
        }

    });
    if (count >= 1) text += ")";

    return text;
}

function displayItemText(item_obj) {

    let item_namespace;
    let enchantments_obj = [];
    if (languageJson.enchants.hasOwnProperty(item_obj.I)) {
        enchantments_obj.push(item_obj.I)
        item_namespace = 'book'
    } else if (typeof (item_obj.I) === 'string') {
        item_namespace = item_obj.I
    } else {
        item_namespace = languageJson.enchants.hasOwnProperty(item_obj.L.I) ? 'book' : item_obj.L.I;
        enchants = findEnchantments(item_obj)
        enchantments_obj = enchants
    }
    if (typeof (item_namespace) === 'undefined') {
        item_namespace = findItemNamespace(item_obj.L)
    }
    const icon_text = '<img src="./images/' + item_namespace + '.gif" class="icon">';
    const items_metadata = languageJson.items;
    const item_name = items_metadata[item_namespace];
    const enchantments_text = displayEnchantmentsText(enchantments_obj);

    return icon_text + " " + item_name + " " + enchantments_text;
}

function findItemNamespace(item) {
    if (item.L.I) {
        name = languageJson.enchants.hasOwnProperty(item.L.I) ? 'book' : item.L.I;
    }
    else {
        findItemNamespace(item.L)
    }
    return name
}

function findEnchantments(item) {
    let enchants = []
    let child_enchants;
    for (const key in item) {
        if (key === "L" || key === "R") {
            if (!item[key].I) {
                child_enchants = findEnchantments(item[key])
                child_enchants.forEach(enchant => {
                    enchants.push(enchant);
                })
            } else {
                enchants.push(item[key].I)
            }
        }
    }
    return enchants;
}

function updateTime(time_milliseconds) {
    const timing_text = languageJson.completed_in + displayTime(time_milliseconds);
    $("#timings").text(timing_text);
    $("#timings").show();
}


function updateCumulativeCost(cumulative_levels, cumulative_xp, minimum_xp = -1) {
    const cost_text = displayLevelXpText(cumulative_levels, cumulative_xp, minimum_xp);
    const cost_header = $("#level-cost");
    cost_header.text(cost_text);
}

function addInstructionDisplay(instruction) {
    const display_text = displayInstructionText(instruction);
    const solution_steps = $("#steps");
    solution_steps.append($("<li>").html(display_text));
}


function afterFoundOptimalSolution(msg) {
    $("#progress").hide();
    $("#phone-warn").hide();
    const instructions = msg.instructions;
    const instructions_count = instructions.length;
    enchants_list = msg.enchants

    const current_time = performance.now();
    const elapsed_time_milliseconds = current_time - start_time;
    updateTime(elapsed_time_milliseconds);

    const solution_section = $("#solution");
    const solution_header = $("#solution-header");
    const solution_steps = $("#steps");
    const steps_header = $("#solution h3");

    solution_steps.html("");
    solution_section.show();

    let minimum_xp;
    if (instructions_count === 0) {
        solution_header.html(languageJson.no_solution_found);
        steps_header.html("");
        updateCumulativeCost(0, 0);
    } else {
        steps_header.html(languageJson.steps);

        const item = msg.item_obj;
        const cumulative_levels = msg.extra[0];
        minimum_xp = item.x;
        const maximum_xp = msg.extra[1];
        updateCumulativeCost(cumulative_levels, maximum_xp, minimum_xp);

        instructions.forEach(instruction => {
            addInstructionDisplay(instruction);
        });

        if (minimum_xp && minimum_xp !== maximum_xp) {
            $("#xp-range-note").show();
        } else {
            $("#xp-range-note").hide();
        }
    }
}

function enchantmentNamespaceFromStylized(enchantment_name) {
    const enchantments_metadata = data.enchants;
    const enchantment_namespaces = Object.keys(enchantments_metadata);

    let namespace_match = "";
    enchantment_namespaces.forEach(enchantment_namespace => {
        const enchantment_name_check = languageJson.enchants[enchantment_namespace];
        if (enchantment_name_check === enchantment_name) namespace_match = enchantment_namespace;
    });

    return namespace_match;
}

function buttonMatchesName(button, enchantment_name) {
    const button_name = button.data("enchant");
    return button_name === enchantment_name;
}

function buttonMatchesLevel(button, enchantment_level) {
    const button_level = button.data("level");
    return button_level === enchantment_level;
}

function filterButton(button, enchantment_name, enchantment_level = -1) {
    const button_matches_name = buttonMatchesName(button, enchantment_name);
    const button_matches_level = buttonMatchesLevel(button, enchantment_level);
    return button_matches_name && !button_matches_level;
}

function turnOffButtons(buttons) {
    buttons.addClass("off");
    buttons.removeClass("on");
    updateCalculateButtonState();
}

function turnOnButtons(buttons) {
    buttons.addClass("on");
    buttons.removeClass("off");
}

function filterEnchantmentButtons(incompatible_namespaces) {
    const enchantments_metadata = data.enchants;
    const enchantment_buttons = $("#enchants button");

    incompatible_namespaces.forEach(incompatible_namespace => {
        const incompatible_name = languageJson.enchants[incompatible_namespace];

        const matching_buttons = enchantment_buttons.filter(function () {
            const this_button = $(this);
            return filterButton(this_button, incompatible_name);
        });
        turnOffButtons(matching_buttons);
    });
}

function updateLevelButtonForOnState(level_button) {
    const button_data = level_button.data();
    const enchantments_metadata = data.enchants;
    const enchantment_buttons = $("#enchants button");

    turnOnButtons(level_button);

    const enchantment_name = button_data.enchant;
    const enchantment_level = button_data.level;

    const matching_buttons = enchantment_buttons.filter(function () {
        const this_button = $(this);
        return filterButton(this_button, enchantment_name, enchantment_level);
    });
    turnOffButtons(matching_buttons);

    const allow_incompatible = doAllowIncompatibleEnchantments();
    if (!allow_incompatible) {
        const enchantment_namespace = enchantmentNamespaceFromStylized(enchantment_name);
        const enchantment_metadata = enchantments_metadata[enchantment_namespace];
        const incompatible_namespaces = enchantment_metadata.incompatible;
        filterEnchantmentButtons(incompatible_namespaces);
    }
}

function isTooManyEnchantments(enchantment_count) {
    const allow_many = doAllowManyEnchantments();
    const many_selected = enchantment_count > ENCHANTMENT_LIMIT_INCLUSIVE;
    return !allow_many && many_selected;
}

function levelButtonClicked(button_clicked) {
    const button_is_on = button_clicked.hasClass("on");

    if (button_is_on) {
        turnOffButtons(button_clicked);
    } else {
        const enchantment_foundation = retrieveEnchantmentFoundation();
        const enchantment_count = enchantment_foundation.length;
        const is_too_many = isTooManyEnchantments(enchantment_count + 1);

        if (is_too_many) {
            let alert_text = "";
            alert_text += languageJson.too_many_enchantments;
            alert_text += languageJson.more_than + ENCHANTMENT_LIMIT_INCLUSIVE + languageJson.enchantments_are_not_recommended;
            alert_text += languageJson.please_select_enchantments;
            alert(alert_text);
        } else {
            updateLevelButtonForOnState(button_clicked);
        }
    }
}

function retrieveEnchantmentFoundation() {
    const enchantment_foundation = [];
    const buttons_on = $("#enchants button.on");

    buttons_on.each(function (button_index, button) {
        const enchantment_name = $(button).data("enchant");
        const enchantment_level = $(button).data("level");
        const enchantment_namespace = enchantmentNamespaceFromStylized(enchantment_name);
        enchantment_foundation.push([enchantment_namespace, enchantment_level]);
    });

    return enchantment_foundation;
}

function retrieveCheapnessMode() {
    return $('input[name="cheapness-mode"]:checked').val();
}

function retrieveSelectedItem() {
    return $("select#item option:selected").val();
}

function updateCalculateButtonState() {
    const enchantment_foundation = retrieveEnchantmentFoundation();
    if (enchantment_foundation.length === 0) {
        $("#calculate").attr("disabled", true);
    } else {
        $("#calculate").attr("disabled", false);
    }
}

function calculate() {
    const enchantment_foundation = retrieveEnchantmentFoundation();
    const no_enchantments_selected = enchantment_foundation.length === 0;
    if (no_enchantments_selected) return;

    const cheapness_mode = retrieveCheapnessMode();
    const item_namespace = retrieveSelectedItem();
    const starting_state = retrieveStartingState();

    startCalculating(item_namespace, enchantment_foundation, cheapness_mode, starting_state);
}

function retrieveStartingState() {
    const penalty = parseInt($("#starting-penalty").val()) || 0;
    const enchants = [];
    $(".starting-enchant-checkbox:checked").each(function () {
        const ns = $(this).data("ns");
        const levelSelect = $(this).siblings(".starting-enchant-level");
        const level = levelSelect.length > 0 ? parseInt(levelSelect.val()) : 1;
        enchants.push([ns, level]);
    });
    return { penalty, enchants };
}


function solutionHeaderTextFromMode(mode) {
    let solution_header_text;
    if (mode === "levels") {
        solution_header_text = languageJson.optimal_solution_cumulative_levels;
    } else if (mode === "prior_work") {
        solution_header_text = languageJson.optimal_solution_prior_work;
    }
    return solution_header_text;
}

function updateSolutionHeader(mode) {
    const solution_header_text = solutionHeaderTextFromMode(mode);
    const solution_header = $("#solution-header");
    solution_header.text(solution_header_text);
}

function startCalculating(item_namespace, enchantment_foundation, mode, starting_state) {
    if (enchantment_foundation.length >= 6) {
        if (
            navigator.userAgent.match(/Android/i) ||
            navigator.userAgent.match(/iPhone/i) ||
            navigator.userAgent.match(/iPad/i)
        ) {
            $("#phone-warn").show();
        }
    }

    total_steps = enchantment_foundation.length;
    total_tries = 0;
    start_time = performance.now();

    $("#solution").hide();
    $("#error").hide();
    updateSolutionHeader(mode);

    worker.postMessage({
        msg: "process",
        item: item_namespace,
        enchants: enchantment_foundation,
        mode: mode,
        starting_state: starting_state
    });
    $("#progress .lbl").text(languageJson.calculating_solution);
    $("#progress").show();
}

function languageChangeListener() {
    const selectLanguage = document.getElementById('language');
    selectLanguage.addEventListener('change', function () {
        const selectedValue = selectLanguage.value;
        changePageLanguage(selectedValue);
    });
}

let langDropdown;
function getFlagUrl(code) {
    return `https://flagcdn.com/w20/${code.toLowerCase()}.png`;
}

async function setupLanguage() {
    langDropdown = createCustomDropdown(
        Object.keys(languages).map(key => ({ value: key, label: languages[key].name })),
        $('#language-selection-container'),
        $('#language'),
        function (val) {
            if (!val) return '';
            const code = languages[val].code;
            return `<img src="${getFlagUrl(code)}" class="flag-icon" alt="">`;
        },
        function (val) {
            changePageLanguage(val);
        }
    );
    defineBrowserLanguage();
}


function defineBrowserLanguage() {
    if (!localStorage.getItem("savedlanguage")) {
        const browserLanguage = navigator.language || navigator.userLanguage;
        if (languages[browserLanguage]) {
            changePageLanguage(browserLanguage);
        } else {
            changePageLanguage('en');
        }
    } else {
        changePageLanguage(localStorage.getItem("savedlanguage"));
    }
}

async function changePageLanguage(language) {
    if (!languages[language]) {
        console.error("Trying to switch to unknown language:", language);
        return;
    }

    languageId = language;
    if (language == 'en') {
        languageJson = await loadJsonLanguage(language).then(languageData => { return languageData });
    } else {
        var languageJsonEn = await loadJsonLanguage('en').then(languageData => { return languageData });
        languageJson = await loadJsonLanguage(language).then(languageData => { return languageData });
        languageJson = mergeKeys(languageJson, languageJsonEn);
    }
    if (languageJson) {
        changeLanguageByJson(languageJson);
        const lang = languages[language];
        if (langDropdown) langDropdown.updateSelection(language, lang.name);
        localStorage.setItem("savedlanguage", language);
    }
}

function mergeKeys(a, b) {
    var o = {};
    for (var i in b) {
        if (typeof b[i] === 'object') {
            o[i] = mergeKeys(a.hasOwnProperty(i) ? a[i] : {}, b[i]);
        } else {
            if (a.hasOwnProperty(i)) {
                o[i] = a[i]
            } else {
                o[i] = b[i];
            }
        }
    }
    return o;
}

function loadJsonLanguage(language) {
    return fetch('languages/' + language + '.json?' + languages_cache_key)
        .then(response => {
            if (!response.ok) {
                throw new Error('Can\'t load language file');
            }
            return response.json();
        })
        .then(data => {
            return data;
        })
        .catch(error => {
            console.error('Language file error:', error);
            return null;
        });
}


function changeLanguageByJson(languageJson) {
    const map = {};
    for (let i in languageJson.enchants) {
        if (map[languageJson.enchants[i]]) {
            console.error("Duplicate string for enchant names (must be unique)", languageId, i, map[languageJson.enchants[i]]);
        }
        map[languageJson.enchants[i]] = i;
    }

    const h1Element = document.getElementsByTagName('h1')[0];
    h1Element.textContent = languageJson.h1_title;

    const summaryEnchants = document.getElementById("summary-about-enchants");
    if (summaryEnchants) summaryEnchants.innerHTML = languageJson.summary_1;

    const paraAboutEnchants = document.getElementById("para-about-enchants");
    if (paraAboutEnchants) paraAboutEnchants.innerHTML = languageJson.paragraph_1;

    const options = document.getElementById("item").getElementsByTagName("option");
    let i = 1;

    if (itemDropdown) {
        itemDropdown.updateOptionLabel("", languageJson.choose_an_item_to_enchant);
        data.items.forEach(item_namespace => {
            itemDropdown.updateOptionLabel(item_namespace, languageJson.items[item_namespace]);
        });
    }

    document.getElementById("override-incompatible").textContent = languageJson.checkbox_label_incompatible;
    document.getElementById("override-max-number").textContent = languageJson.checkbox_label_max_number;

    document.getElementById("calculate").textContent = languageJson.calculate;

    document.getElementById("optimize-label").textContent = languageJson.optimize_for;
    document.getElementById("optimize-xp").textContent = languageJson.radio_label_optimize_xp;
    document.getElementById("optimize-pwp").textContent = languageJson.radio_label_optimize_pwp;

    document.getElementById("total-cost-label").textContent = languageJson.total_cost;

    document.getElementById("xp-range-note").textContent = languageJson.note;

    const startingTitle = document.getElementById("starting-item-state-title");
    if (startingTitle) startingTitle.textContent = languageJson.starting_item_state_title;
    const anvilPenaltyLabel = document.getElementById("anvil-penalty-label");
    if (anvilPenaltyLabel) anvilPenaltyLabel.textContent = languageJson.anvil_penalty;
    const existingEnchantsLabel = document.getElementById("existing-enchantments-label");
    if (existingEnchantsLabel) existingEnchantsLabel.textContent = languageJson.existing_enchantments;

    const galleryT = document.querySelector('#bg-gallery-modal h2');
    if (galleryT) galleryT.textContent = languageJson.gallery_title;
    const galleryUpload = document.getElementById('upload-custom-bg-btn');
    if (galleryUpload) galleryUpload.textContent = languageJson.gallery_upload;
    const galleryNone = document.querySelector('#bg-gallery-modal .none-option');
    if (galleryNone) galleryNone.setAttribute('data-name', languageJson.gallery_none);

    if (penaltyDropdown) {
        penaltyDropdown.updateOptionLabel("0", "0 " + languageJson.penalty_new);
        penaltyDropdown.updateOptionLabel("6", languageJson.penalty_plus);
    }

    $("select#item").change();
    $("#solution").hide();
    $("#error").hide();
}

function setupBackgroundImage() {
    const bgInput = document.getElementById('bg-image-input');
    const openGalleryBtn = document.getElementById('open-gallery-btn');
    const closeGalleryBtn = document.getElementById('close-gallery-btn');
    const galleryModal = document.getElementById('bg-gallery-modal');

    const savedBg = localStorage.getItem('custom-bg-image');
    const isRandom = localStorage.getItem('custom-bg-random') === 'true';
    if (savedBg && !isRandom) {
        const isTiled = localStorage.getItem('custom-bg-tiled') === 'true';
        const isPixelated = localStorage.getItem('custom-bg-pixelated') === 'true';
        applyBackgroundImage(savedBg, isTiled, isPixelated);
    }

    let galleryLoaded = false;
    if (openGalleryBtn && galleryModal) {
        openGalleryBtn.addEventListener('click', function (e) {
            e.preventDefault();
            galleryModal.style.display = 'flex';

            if (!galleryLoaded) {
                const galleryGrid = galleryModal.querySelector('.gallery-grid');
                galleryGrid.innerHTML = '';

                const noneDiv = document.createElement('div');
                noneDiv.className = 'gallery-img gallery-none-card';
                noneDiv.innerHTML = '<span style="font-size: 24px; font-weight: bold;">None</span>';
                noneDiv.setAttribute('data-name', 'Clear Background');
                noneDiv.addEventListener('click', function () {
                    clearBackground();
                    galleryModal.style.display = 'none';
                });

                function formatImageName(src) {
                    let filename = src.split('/').pop().split('.')[0];
                    filename = filename.replace(/^1920px-/, '');
                    filename = filename.replace(/_\d+x\d+$/, '');
                    return filename.split('_').map(word => {
                        return word.charAt(0).toUpperCase() + word.slice(1);
                    }).join(' ');
                }

                const hasWallpapers = typeof BACKGROUND_IMAGES !== 'undefined' && BACKGROUND_IMAGES.length > 0;
                const hasBlocks = (typeof BLOCK_IMAGES !== 'undefined' && BLOCK_IMAGES.length > 0);
                if (hasWallpapers || hasBlocks) {
                    // Set toggle state
                    const randomToggle = document.getElementById('random-bg-toggle');
                    if (randomToggle) {
                        const isRandom = localStorage.getItem('custom-bg-random') === 'true';
                        randomToggle.classList.toggle('active', isRandom);
                    }

                    // Add static options at the very beginning
                    galleryGrid.appendChild(noneDiv);

                    if (hasWallpapers) {
                        BACKGROUND_IMAGES.forEach(src => {
                            const img = document.createElement('img');
                            img.src = src;
                            img.className = 'gallery-img';
                            img.setAttribute('data-src', src);
                            const name = formatImageName(src);
                            img.alt = name;
                            img.setAttribute('data-name', name);
                            img.addEventListener('click', function (evt) {
                                applyBackgroundImage(src, false, false);
                                try {
                                    localStorage.setItem('custom-bg-image', src);
                                    localStorage.setItem('custom-bg-tiled', 'false');
                                    localStorage.setItem('custom-bg-pixelated', 'false');
                                } catch (err) { }
                                galleryModal.style.display = 'none';
                            });
                            galleryGrid.appendChild(img);
                        });
                    }

                    if (typeof PAINTING_IMAGES !== 'undefined' && PAINTING_IMAGES.length > 0) {
                        const paintingHeader = document.createElement('div');
                        paintingHeader.className = 'gallery-section-title';
                        paintingHeader.textContent = 'Paintings';
                        galleryGrid.appendChild(paintingHeader);

                        PAINTING_IMAGES.forEach(src => {
                            const img = document.createElement('img');
                            img.src = src;
                            img.className = 'gallery-img square';
                            img.setAttribute('data-src', src);
                            const name = formatImageName(src);
                            img.alt = name;
                            img.setAttribute('data-name', name);
                            img.addEventListener('click', function (evt) {
                                applyBackgroundImage(src, false, true);
                                try {
                                    localStorage.setItem('custom-bg-image', src);
                                    localStorage.setItem('custom-bg-tiled', 'false');
                                    localStorage.setItem('custom-bg-pixelated', 'true');
                                } catch (err) { }
                                galleryModal.style.display = 'none';
                            });
                            galleryGrid.appendChild(img);
                        });
                    }


                    if (typeof BLOCK_IMAGES !== 'undefined') {
                        const blockHeader = document.createElement('div');
                        blockHeader.className = 'gallery-section-title';
                        blockHeader.textContent = 'Blocks (Tiled)';
                        galleryGrid.appendChild(blockHeader);

                        if (BLOCK_IMAGES.length === 0) {
                            const emptyMsg = document.createElement('p');
                            emptyMsg.style.gridColumn = '1/-1';
                            emptyMsg.style.textAlign = 'center';
                            emptyMsg.style.fontSize = '0.9rem';
                            emptyMsg.style.color = 'var(--fg-secondary)';
                            emptyMsg.textContent = 'No pre-installed blocks.';
                            galleryGrid.appendChild(emptyMsg);
                        } else {
                            BLOCK_IMAGES.forEach(src => {
                                const img = document.createElement('img');
                                img.src = src;
                                img.className = 'gallery-img square';
                                img.setAttribute('data-src', src);
                                const name = formatImageName(src);
                                img.alt = name;
                                img.setAttribute('data-name', name);
                                img.addEventListener('click', function (evt) {
                                    applyBackgroundImage(src, true, true);
                                    try {
                                        localStorage.setItem('custom-bg-image', src);
                                        localStorage.setItem('custom-bg-tiled', 'true');
                                        localStorage.setItem('custom-bg-pixelated', 'true');
                                    } catch (err) { }
                                    galleryModal.style.display = 'none';
                                });
                                galleryGrid.appendChild(img);
                            });
                        }
                    }

                    const tooltip = document.getElementById('gallery-custom-tooltip');
                    const modalContent = galleryModal.querySelector('.modal-content');

                    modalContent.addEventListener('mousemove', function (e) {
                        if (tooltip && tooltip.style.display === 'block') {
                            tooltip.style.left = (e.clientX + 16) + 'px';
                            tooltip.style.top = (e.clientY + 16) + 'px';
                        }
                    });

                    modalContent.addEventListener('mouseover', function (evt) {
                        const target = evt.target.closest('.gallery-img, .gallery-none-card, .filter-btn, .gallery-toggle-btn, .upload-btn');
                        if (target) {
                            if (tooltip) {
                                const name = target.getAttribute('data-name') || target.textContent || 'None';
                                tooltip.textContent = name;
                                tooltip.style.display = 'block';
                                if (target.title) target.title = "";
                            }
                        }
                    });

                    modalContent.addEventListener('mouseout', function (evt) {
                        if (tooltip) tooltip.style.display = 'none';
                    });

                    galleryLoaded = true;
                } else {
                    galleryGrid.appendChild(noneDiv);
                    const emptyMsg = document.createElement('p');
                    emptyMsg.style.gridColumn = '1/-1';
                    emptyMsg.style.textAlign = 'center';
                    emptyMsg.style.color = 'var(--fg-secondary)';
                    emptyMsg.textContent = 'No pre-installed images found. You can manually upload your own below!';
                    galleryGrid.appendChild(emptyMsg);
                    galleryLoaded = true;
                }
            }
        });
    }

    if (closeGalleryBtn && galleryModal) {
        closeGalleryBtn.addEventListener('click', function (e) {
            galleryModal.style.display = 'none';
        });
    }

    window.addEventListener('click', function (e) {
        if (e.target === galleryModal) {
            galleryModal.style.display = 'none';
        }
    });

    if (bgInput) {
        bgInput.addEventListener('change', function (e) {
            handleBackgroundUpload(e, false);
        });
    }

    const blockInput = document.getElementById('block-image-input');
    if (blockInput) {
        blockInput.addEventListener('change', function (e) {
            handleBackgroundUpload(e, true);
        });
    }

    function handleBackgroundUpload(e, tiled) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                const dataUrl = event.target.result;
                applyBackgroundImage(dataUrl, tiled, true);
                try {
                    localStorage.setItem('custom-bg-image', dataUrl);
                    localStorage.setItem('custom-bg-tiled', tiled);
                    localStorage.setItem('custom-bg-pixelated', 'true');
                } catch (err) {
                    console.warn("Could not save background image to localStorage:", err);
                }
            };
            reader.readAsDataURL(file);
            if (galleryModal) galleryModal.style.display = 'none';
        }
    }
    const randomToggle = document.getElementById('random-bg-toggle');
    if (randomToggle) {
        randomToggle.addEventListener('click', function () {
            const isNowRandom = localStorage.getItem('custom-bg-random') !== 'true';
            localStorage.setItem('custom-bg-random', isNowRandom ? 'true' : 'false');
            randomToggle.classList.toggle('active', isNowRandom);

            if (isNowRandom) {
                const all = [];
                const bgsSelected = localStorage.getItem('custom-bg-include-wallpapers') !== 'false';
                const paintingsSelected = localStorage.getItem('custom-bg-include-paintings') !== 'false';
                const blocksSelected = localStorage.getItem('custom-bg-include-blocks') !== 'false';

                if (bgsSelected) {
                    const bgs = (typeof BACKGROUND_IMAGES !== 'undefined' ? BACKGROUND_IMAGES : []);
                    bgs.forEach(src => all.push({ src, tiled: false, pixelated: false }));
                }
                if (paintingsSelected) {
                    const pt = (typeof PAINTING_IMAGES !== 'undefined' ? PAINTING_IMAGES : []);
                    pt.forEach(src => all.push({ src, tiled: false, pixelated: true }));
                }
                if (blocksSelected) {
                    const bl = (typeof BLOCK_IMAGES !== 'undefined' ? BLOCK_IMAGES : []);
                    bl.forEach(src => all.push({ src, tiled: true, pixelated: true }));
                }

                if (all.length > 0) {
                    const choice = all[Math.floor(Math.random() * all.length)];
                    applyBackgroundImage(choice.src, choice.tiled, choice.pixelated, true);
                    // Persist for this session
                    try {
                        localStorage.setItem('custom-bg-image', choice.src);
                        localStorage.setItem('custom-bg-tiled', choice.tiled);
                        localStorage.setItem('custom-bg-pixelated', choice.pixelated);
                    } catch (e) { }
                    localStorage.setItem('custom-bg-random', 'true');
                    if (randomToggle) randomToggle.classList.add('active');
                }
            } else {
                localStorage.setItem('custom-bg-random', 'false');
                if (randomToggle) randomToggle.classList.remove('active');
            }
        });
    }

    // Category filters
    const filterWallpapers = document.getElementById('random-filter-wallpapers');
    const filterPaintings = document.getElementById('random-filter-paintings');
    const filterBlocks = document.getElementById('random-filter-blocks');

    function setupFilter(btn, key) {
        if (!btn) return;
        const isActive = localStorage.getItem(key) !== 'false';
        btn.classList.toggle('active', isActive);
        btn.addEventListener('click', function () {
            const nowActive = !btn.classList.contains('active');
            btn.classList.toggle('active', nowActive);
            localStorage.setItem(key, nowActive ? 'true' : 'false');
        });
    }

    setupFilter(filterWallpapers, 'custom-bg-include-wallpapers');
    setupFilter(filterPaintings, 'custom-bg-include-paintings');
    setupFilter(filterBlocks, 'custom-bg-include-blocks');
}

function clearBackground() {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundAttachment = '';
    document.body.classList.remove('has-custom-bg');
    document.body.classList.remove('tiled');
    document.body.classList.remove('pixelated-bg');
    localStorage.removeItem('custom-bg-image');
    localStorage.removeItem('custom-bg-tiled');
    localStorage.removeItem('custom-bg-pixelated');
    localStorage.removeItem('custom-bg-random');
    const bgInput = document.getElementById('bg-image-input');
    if (bgInput) bgInput.value = '';
    const blockInput = document.getElementById('block-image-input');
    if (blockInput) blockInput.value = '';
    const randomToggle = document.getElementById('random-bg-toggle');
    if (randomToggle) randomToggle.classList.remove('active');
}

function applyBackgroundImage(dataUrl, tiled = false, pixelated = false, fromRandom = false) {
    document.body.style.backgroundImage = 'url("' + dataUrl + '")';
    document.body.classList.add('has-custom-bg');
    if (!fromRandom) {
        localStorage.setItem('custom-bg-random', 'false');
        const randomToggle = document.getElementById('random-bg-toggle');
        if (randomToggle) randomToggle.classList.remove('active');
    }
    if (tiled) {
        document.body.classList.add('tiled');
        document.body.classList.add('pixelated-bg');
    } else {
        document.body.classList.remove('tiled');
        if (pixelated) {
            document.body.classList.add('pixelated-bg');
        } else {
            document.body.classList.remove('pixelated-bg');
        }
    }
}
