/**
ATreeNode spec:

ATreeNode: {
    children: List[ATreeNode]   // nodes that this node can link to downstream (or sideways)
    parents:  List[ATreeNode]   // nodes that can link to this one from upstream (or sideways)
    ability:  atree_node        // raw data from atree json
}

atree_node: {
    display_name:   str
    id:             int
    desc:           str
    archetype:      Optional[str]   // not present or empty string = no arch
    archetype_req:  Optional[int]   // default: 0
    base_abil:      Optional[int]   // Modify another abil? poorly defined...
    parents:        List[int]
    dependencies:   List[int]       // Hard reqs
    blockers:       List[int]       // If any in here are taken, i am invalid
    cost:           int             // cost in AP
    display: {                      // stuff for rendering ATree
        row: int
        col: int
        icon: str
    }
    properties:     Map[str, float] // Dynamic (modifiable) misc. properties; ex. AOE
    effects:        List[effect]
}

effect: replace_spell | add_spell_prop | convert_spell_conv | raw_stat | stat_scaling

replace_spell: {
    type:           "replace_spell"
    ... rest of fields are same as `spell` type (see: damage_calc.js)
}

add_spell_prop: {
    type:           "add_spell_prop"
    base_spell:     int             // spell identifier
    target_part:    Optional[str]   // Part of the spell to modify. Can be not present/empty for ex. cost modifier.
                                    //     If target part does not exist, a new part is created.
    behavior:       Optional[str]   // One of: "merge", "modify". default: merge
                                    //     merge: add if exist, make new part if not exist
                                    //     modify: change existing part. do nothing if not exist
    cost:           Optional[int]   // change to spellcost
    multipliers:    Optional[array[float, 6]]   // Additive changes to spellmult (for damage spell)
    power:          Optional[float] // Additive change to healing power (for heal spell)
    hits:           Optional[Map[str, float]]   // Additive changes to hits (for total entry)
    display:        Optional[str]   // Optional change to the displayed entry. Replaces old
}

convert_spell_conv: {
    type:           "convert_spell_conv"
    base_spell:     int             // spell identifier
    target_part:    "all" | str     // Part of the spell to modify. Can be not present/empty for ex. cost modifier.
                                    //      "all" means modify all parts.
    conversion:     element_str
}
raw_stat: {
    type:           "raw_stat"
    toggle:         Optional[bool | str]    // default: false; true means create anon. toggle,
                                            // string value means bind to (or create) named button
    behavior:       Optional[str]           // One of: "merge", "modify". default: merge
                                            //     merge: add if exist, make new part if not exist
                                            //     modify: change existing part. do nothing if not exist
    bonuses:        List[stat_bonus]
}
stat_bonus: {
  "type": "stat" | "prop",
  "abil": Optional[int],
  "name": str,
  "value": float
}
stat_scaling: {
  "type": "stat_scaling",
  "slider": bool,
  "slider_name": Optional[str],
  "slider_step": Optional[float],
  slider_behavior:  Optional[str]           // One of: "merge", "modify". default: merge
                                            //     merge: add if exist, make new part if not exist
                                            //     modify: change existing part. do nothing if not exist
  slider_max: Optional[float]               // affected by slider_behavior
  "inputs": Optional[list[scaling_target]],
  "output": scaling_target | List[scaling_target],
  "scaling": list[float],
  "max": float
}
scaling_target: {
  "type": "stat" | "prop",
  "abil": Optional[int],
  "name": str
}
*/


const elem_mastery_abil = { display_name: "Elemental Mastery", id: 998, properties: {}, effects: [] };

// TODO: Range numbers
const default_abils = {
    Mage: [{
        display_name: "Mage Melee",
        id: 999,
        desc: "Mage basic attack.",
        properties: {range: 5000},
        effects: [default_spells.wand[0]]
    }, elem_mastery_abil ],
    Warrior: [{
        display_name: "Warrior Melee",
        id: 999,
        desc: "Warrior basic attack.",
        properties: {range: 2},
        effects: [default_spells.spear[0]]
    }, elem_mastery_abil ],
    Archer: [{
        display_name: "Archer Melee",
        id: 999,
        desc: "Archer basic attack.",
        properties: {range: 20},
        effects: [default_spells.bow[0]]
    }, elem_mastery_abil ],
    Assassin: [{
        display_name: "Assassin Melee",
        id: 999,
        desc: "Assassin basic attack.",
        properties: {range: 2},
        effects: [default_spells.dagger[0]]
    }, elem_mastery_abil ],
    Shaman: [{
        display_name: "Shaman Melee",
        id: 999,
        desc: "Shaman basic attack.",
        properties: {range: 15, speed: 0},
        effects: [default_spells.relik[0]]
    }, elem_mastery_abil ],
};


/**
 * Update ability tree internal representation. (topologically sorted node list)
 *
 * Signature: AbilityTreeUpdateNode(player-class: str) => ATree (List of atree nodes in topological order)
 */
const atree_node = new (class extends ComputeNode {
    constructor() { super('builder-atree-update'); }

    compute_func(input_map) {
        if (input_map.size !== 1) { throw "AbilityTreeUpdateNode accepts exactly one input (player-class)"; }
        const [player_class] = input_map.values();  // Extract values, pattern match it into size one list and bind to first element

        const atree_raw = atrees[player_class];
        if (!atree_raw) return [];

        let atree_map = new Map();
        let atree_head;
        for (const i of atree_raw) {
            atree_map.set(i.id, {children: [], ability: i});
            if (i.parents.length == 0) {
                // Assuming there is only one head.
                atree_head = atree_map.get(i.id);
            }
        }
        for (const i of atree_raw) {
            let node = atree_map.get(i.id);
            let parents = [];
            for (const parent_id of node.ability.parents) {
                let parent_node = atree_map.get(parent_id);
                parent_node.children.push(node);
                parents.push(parent_node);
            }
            node.parents = parents;
        }
        console.log(atree_map);

        let atree_topo_sort = [];
        topological_sort_tree(atree_head, atree_topo_sort, new Map());
        atree_topo_sort.reverse();
        return atree_topo_sort;
    }
})();

/**
 * Create a reverse topological sort of the tree in the result list.
 * NOTE: our structure isn't a tree... it isn't even acyclic... but do it anyway i guess...
 *
 * https://en.wikipedia.org/wiki/Topological_sorting
 * @param tree: Root of tree to sort
 * @param res: Result list (reverse topological order)
 * @param mark_state: Bookkeeping. Call with empty Map()
 */
function topological_sort_tree(tree, res, mark_state) {
    const state = mark_state.get(tree);
    if (state === undefined) {
        // unmarked.
        mark_state.set(tree, false);    // temporary mark
        for (const child of tree.children) {
            topological_sort_tree(child, res, mark_state);
        }
        mark_state.set(tree, true);     // permanent mark
        res.push(tree);
    }
    // these cases are not needed. Case 1 does nothing, case 2 should never happen.
    // else if (state === true) { return; } // permanent mark.
    // else if (state === false) { throw "not a DAG"; } // temporary mark.
}

/**
 * Display ability tree from topologically sorted list.
 *
 * Signature: AbilityTreeRenderNode(atree: ATree) => RenderedATree ( Map[id, RenderedATNode] )
 */
const atree_render = new (class extends ComputeNode {
    constructor() {
        super('builder-atree-render');
        this.fail_cb = true;
        this.UI_elem = document.getElementById("atree-ui");
        this.list_elem = document.getElementById("atree-header");
    }

    compute_func(input_map) {
        if (input_map.size !== 1) { throw "AbilityTreeRenderNode accepts exactly one input (atree)"; }
        const [atree] = input_map.values();  // Extract values, pattern match it into size one list and bind to first element
        
        //for some reason we have to cast to string 
        this.list_elem.innerHTML = ""; //reset all atree actives - should be done in a more general way later
        this.UI_elem.innerHTML = ""; //reset the atree in the DOM

        let ret = null;
        if (atree) { ret = render_AT(this.UI_elem, this.list_elem, atree); }

        //Toggle on, previously was toggled off
        toggle_tab('atree-dropdown'); toggleButton('toggle-atree');

        return ret;
    }
})().link_to(atree_node);

// This exists so i don't have to re-render the UI to push atree updates.
const atree_state_node = new (class extends ComputeNode {
    constructor() { super('builder-atree-state'); }

    compute_func(input_map) {
        if (input_map.size !== 1) { throw "AbilityTreeStateNode accepts exactly one input (atree-rendered)"; }
        const [rendered_atree] = input_map.values();  // Extract values, pattern match it into size one list and bind to first element
        return rendered_atree;
    }
})().link_to(atree_render, 'atree-render');

/**
 * Collect abilities and condense them into a list of "final abils".
 * This is just for rendering purposes, and for collecting things that modify spells into one chunk.
 * I stg if wynn makes abils that modify multiple spells
 * ... well we can extend this by making `base_abil` a list instead but annoy
 *
 * Signature: AbilityTreeMergeNode(player-class: WeaponType, atree: ATree, atree-state: RenderedATree) => Map[id, Ability]
 */
const atree_merge = new (class extends ComputeNode {
    constructor() { super('builder-atree-merge'); }

    compute_func(input_map) {
        const player_class = input_map.get('player-class');
        const atree_state = input_map.get('atree-state');
        const atree_order = input_map.get('atree');

        let abils_merged = new Map();
        for (const abil of default_abils[player_class]) {
            let tmp_abil = deepcopy(abil);
            if (!('desc' in tmp_abil)) {
                tmp_abil.desc = [];
            }
            else if (!Array.isArray(tmp_abil.desc)) {
                tmp_abil.desc = [tmp_abil.desc];
            }
            tmp_abil.subparts = [abil.id];
            abils_merged.set(abil.id, tmp_abil);
        }

        for (const node of atree_order) {
            const abil_id = node.ability.id;
            if (!atree_state.get(abil_id).active) {
                continue;
            }
            const abil = node.ability;

            if ('base_abil' in abil) {
                if (abils_merged.has(abil.base_abil)) {
                    // Merge abilities.
                    // TODO: What if there is more than one base abil?
                    let base_abil = abils_merged.get(abil.base_abil);
                    if (Array.isArray(abil.desc)) { base_abil.desc = base_abil.desc.concat(abil.desc); }
                    else { base_abil.desc.push(abil.desc); }

                    base_abil.subparts.push(abil.id);
                    base_abil.effects = base_abil.effects.concat(abil.effects);
                    for (let propname in abil.properties) {
                        base_abil[propname] = abil[propname];
                    }
                }
                // do nothing otherwise.
            }
            else {
                let tmp_abil = deepcopy(abil);
                if (!Array.isArray(tmp_abil.desc)) {
                    tmp_abil.desc = [tmp_abil.desc];
                }
                tmp_abil.subparts = [abil.id];
                abils_merged.set(abil_id, tmp_abil);
            }
        }
        return abils_merged;
    }
})().link_to(atree_node, 'atree').link_to(atree_state_node, 'atree-state');

/**
 * Check if an atree node can be activated.
 *
 * Return: [yes/no, hard error, reason]
 */
function abil_can_activate(atree_node, atree_state, reachable, archetype_count, points_remain) {
    const {parents, ability} = atree_node;
    if (parents.length === 0) {
        return [true, false, ""];
    }
    let failed_deps = [];
    for (const dep_id of ability.dependencies) {
        if (!atree_state.get(dep_id).active) { failed_deps.push(dep_id) }
    }
    if (failed_deps.length > 0) {
        const dep_strings = failed_deps.map(i => '"' + atree_state.get(i).ability.display_name + '"');
        return [false, true, 'missing dep: ' + dep_strings.join(", ")];
    }
    let blocking_ids = [];
    for (const blocker_id of ability.blockers) {
        if (atree_state.get(blocker_id).active) { blocking_ids.push(blocker_id); }
    }
    if (blocking_ids.length > 0) {
        const blockers_strings = blocking_ids.map(i => '"' + atree_state.get(i).ability.display_name + '"');
        return [false, true, 'blocked by: '+blockers_strings.join(", ")];
    }
    let node_reachable = false;
    for (const parent of parents) {
        if (reachable.has(parent.ability.id)) {
            node_reachable = true;
            break;
        }
    }
    if (!node_reachable) {
        return [false, false, 'not reachable'];
    }
    if ('archetype' in ability && ability.archetype !== "") {
        if ('archetype_req' in ability && ability.archetype_req !== 0) {
            const others = (archetype_count.get(ability.archetype) || 0);
            if (others < ability.archetype_req) {
                return [false, false, ability.archetype+': '+others+' < '+ability.archetype_req];
            }
        }
    }
    if (ability.cost > points_remain) {
        return [false, false, "not enough ability points left"];
    }
    return [true, false, ""];
}

/**
 * Validate ability tree.
 * Return list of errors for rendering.
 *
 * Signature: AbilityTreeMergeNode(atree: ATree, atree-state: RenderedATree) => List[str]
 */
const atree_validate = new (class extends ComputeNode {
    constructor() { super('atree-validator'); }

    compute_func(input_map) {
        const atree_state = input_map.get('atree-state');
        const atree_order = input_map.get('atree');
        const level = parseInt(input_map.get('level'));

        if (atree_order.length == 0) { return [0, false, ['no atree data']]; }

        let atree_to_add = [];
        let atree_not_present = [];
        // mark all selected nodes as bright, and mark all other nodes as dark.
        // also initialize the "to check" list, and the "not present" list.
        for (const node of atree_order) {
            const abil = node.ability;
            if (atree_state.get(abil.id).active) {
                atree_to_add.push([node, 'not reachable', false]);
                atree_state.get(abil.id).img.src = '../media/atree/' + abil.display.icon + '_selected.png';
            }
            else {
                atree_not_present.push(abil.id);
                atree_state.get(abil.id).img.src = '../media/atree/' + abil.display.icon + '_blocked.png';
            }
        }

        let reachable = new Set();
        let abil_points_total = 0;
        let archetype_count = new Map();
        while (true) {
            let _add = [];
            for (const [node, fail_reason, fail_hardness] of atree_to_add) {
                const {ability} = node;
                const [success, hard_error, reason] = abil_can_activate(node, atree_state, reachable, archetype_count, 9999);
                if (!success) {
                    _add.push([node, reason, hard_error]);
                    continue;
                }
                if ('archetype' in ability && ability.archetype !== "") {
                    let val = 1;
                    if (archetype_count.has(ability.archetype)) {
                        val = archetype_count.get(ability.archetype) + 1;
                    }
                    archetype_count.set(ability.archetype, val);
                }
                abil_points_total += ability.cost;
                reachable.add(ability.id);
            }
            if (atree_to_add.length == _add.length) {
                break;
            }
            atree_to_add = _add;
        }
        const atree_level_table = ['lvl0wtf',1,2,2,3,3,4,4,5,5,6,6,7,8,8,9,9,10,11,11,12,12,13,14,14,15,16,16,17,17,18,18,19,19,20,20,20,21,21,22,22,23,23,23,24,24,25,25,26,26,27,27,28,28,29,29,30,30,31,31,32,32,33,33,34,34,34,35,35,35,36,36,36,37,37,37,38,38,38,38,39,39,39,39,40,40,40,40,41,41,41,41,42,42,42,42,43,43,43,43,44,44,44,44,45,45,45];
        let AP_cap;
        if (isNaN(level)) {
            AP_cap = 45;   
        }
        else {
            AP_cap = atree_level_table[level];
        }
        document.getElementById('active_AP_cap').textContent = AP_cap;
        document.getElementById("active_AP_cost").textContent = abil_points_total;
        const ap_left = AP_cap - abil_points_total;

        // using the "not present" list, highlight one-step reachable nodes.
        for (const node_id of atree_not_present) {
            const node = atree_state.get(node_id);
            const [success, hard_error, reason] = abil_can_activate(node, atree_state, reachable, archetype_count, ap_left);
            if (success) {
                node.img.src = '../media/atree/'+node.ability.display.icon+'.png';
            }
        }

        let hard_error = false;
        let errors = [];
        if (abil_points_total > AP_cap) {
            errors.push('too many ability points assigned! ('+abil_points_total+' > '+AP_cap+')');
        }
        for (const [node, fail_reason, fail_hardness] of atree_to_add) {
            if (fail_hardness) { hard_error = true; }
            errors.push(node.ability.display_name + ": " + fail_reason);
        }

        return [hard_error, errors];
    }
})().link_to(atree_node, 'atree').link_to(atree_state_node, 'atree-state');

/**
 * Render ability tree.
 * Return map of id -> corresponding html element.
 *
 * Signature: AbilityTreeRenderActiveNode(atree-merged: MergedATree, atree-order: ATree, atree-errors: List[str]) => Map[int, ATreeNode]
 */
const atree_render_active = new (class extends ComputeNode {
    constructor() {
        super('atree-render-active');
        this.list_elem = document.getElementById("atree-active");
    }

    compute_func(input_map) {
        const merged_abils = input_map.get('atree-merged');
        const atree_order = input_map.get('atree-order');
        const [hard_error, _errors] = input_map.get('atree-errors');
        const errors = deepcopy(_errors);

        this.list_elem.innerHTML = ""; //reset all atree actives - should be done in a more general way later
        // TODO: move to display?
        if (errors.length > 0) {
            let errorbox = document.createElement('div');
            errorbox.classList.add("rounded-bottom", "dark-4", "border", "p-0", "mx-2", "my-4", "dark-shadow");
            this.list_elem.appendChild(errorbox);

            let error_title = document.createElement('b');
            error_title.classList.add("warning", "scaled-font");
            error_title.innerHTML = "ATree Error!";
            errorbox.appendChild(error_title);

            for (let i = 0; i < 5 && i < errors.length; ++i) {
                const error = errors[i];
                const atree_warning = make_elem("p", ["warning", "small-text"], {textContent: error});
                errorbox.appendChild(atree_warning);
            }
            if (errors.length > 5) {
                const error = '... ' + (errors.length-5) + ' errors not shown';
                const atree_warning = make_elem("p", ["warning", "small-text"], {textContent: error});
                errorbox.appendChild(atree_warning);
            }
        }
        const ret_map = new Map();
        const to_render_id = [999, 998];
        for (const node of atree_order) {
            if (!merged_abils.has(node.ability.id)) {
                continue;
            }
            to_render_id.push(node.ability.id);
        }
        for (const id of to_render_id) {
            const abil = merged_abils.get(id);

            let active_tooltip = document.createElement('div');
            active_tooltip.classList.add("rounded-bottom", "dark-4", "border", "p-0", "mx-2", "my-4", "dark-shadow");

            let active_tooltip_title = document.createElement('b');
            active_tooltip_title.classList.add("scaled-font");
            active_tooltip_title.innerHTML = abil.display_name;
            active_tooltip.appendChild(active_tooltip_title);

            for (const desc of abil.desc) {
                let active_tooltip_desc = document.createElement('p');
                active_tooltip_desc.classList.add("scaled-font-sm", "my-0", "mx-1", "text-wrap");
                active_tooltip_desc.textContent = desc;
                active_tooltip.appendChild(active_tooltip_desc);
            }
            ret_map.set(abil.id, active_tooltip);

            this.list_elem.appendChild(active_tooltip);
        }
        return ret_map;
    }
})().link_to(atree_node, 'atree-order').link_to(atree_merge, 'atree-merged').link_to(atree_validate, 'atree-errors');

/**
 * Collect spells from abilities.
 *
 * Signature: AbilityCollectSpellsNode(atree-merged: Map[id, Ability]) => List[Spell]
 */
const atree_collect_spells = new (class extends ComputeNode {
    constructor() { super('atree-spell-collector'); }

    compute_func(input_map) {
        const atree_merged = input_map.get('atree-merged');
        const [hard_error, errors] = input_map.get('atree-errors');
        if (hard_error) { return []; }
        
        let ret_spells = new Map();
        for (const [abil_id, abil] of atree_merged.entries()) {
            // TODO: Possibly, make a better way for detecting "spell abilities"?
            for (const effect of abil.effects) {
                if (effect.type === 'replace_spell') {
                    // replace_spell just replaces all (defined) aspects.
                    const ret_spell = ret_spells.get(effect.base_spell);
                    if (ret_spell) {
                        // NOTE: do not mutate results of previous steps!
                        for (const key in effect) {
                            ret_spell[key] = deepcopy(effect[key]);
                        }
                    }
                    else {
                        ret_spells.set(effect.base_spell, deepcopy(effect));
                    }
                }
            }
        }

        for (const [abil_id, abil] of atree_merged.entries()) {
            for (const effect of abil.effects) {
                switch (effect.type) {
                case 'replace_spell':
                    // Already handled above.
                    continue;
                case 'add_spell_prop': {
                    const { base_spell, target_part = null, cost = 0, behavior = 'merge'} = effect;
                    const ret_spell = ret_spells.get(base_spell);
                    // TODO: unjankify this...
                    if ('cost' in ret_spell) { ret_spell.cost += cost; }

                    if (target_part  === null) {
                        continue;
                    }

                    let found_part = false;
                    for (let part of ret_spell.parts) { // TODO: replace with Map? to avoid this linear search... idk prolly good since its not more verbose to type in json
                        if (part.name === target_part) {
                            if ('multipliers' in effect) {
                                for (const [idx, v] of effect.multipliers.entries()) {  // python: enumerate()
                                    part.multipliers[idx] += v;
                                }
                            }
                            else if ('power' in effect) {
                                part.power += effect.power;
                            }
                            else if ('hits' in effect) {
                                for (const [idx, v] of Object.entries(effect.hits)) { // looks kinda similar to multipliers case... hmm... can we unify all of these three? (make healpower a list)
                                    if (idx in part.hits) { part.hits[idx] += v; }
                                    else { part.hits[idx] = v; }
                               }
                            }
                            else {
                                throw "uhh invalid spell add effect";
                            }
                            found_part = true;
                            break;
                        }
                    }
                    if (!found_part && behavior === 'merge') { // add part. if behavior is merge
                        let spell_part = deepcopy(effect);
                        spell_part.name = target_part;  // has some extra fields but whatever
                        ret_spell.parts.push(spell_part);
                    }
                    if ('display' in effect) {
                        ret_spell.display = effect.display;
                    }
                    continue;
                }
                case 'convert_spell_conv':
                    const { base_spell, target_part, conversion } = effect;
                    const ret_spell = ret_spells.get(base_spell);
                    const elem_idx = damageClasses.indexOf(conversion);
                    let filter = target_part === 'all';
                    for (let part of ret_spell.parts) { // TODO: replace with Map? to avoid this linear search... idk prolly good since its not more verbose to type in json
                        if (filter || part.name === target_part) {
                            if ('multipliers' in part) {
                                let total_conv = 0;
                                for (let i = 1; i < 6; ++i) {   // skip neutral
                                    total_conv += part.multipliers[i];
                                }
                                let new_conv = [part.multipliers[0], 0, 0, 0, 0, 0];
                                new_conv[elem_idx] = total_conv;
                                part.multipliers = new_conv;
                            }
                        }
                    }
                    continue;
                }
            }
        }
        return ret_spells;
    }
})().link_to(atree_merge, 'atree-merged').link_to(atree_validate, 'atree-errors');


/**
 * Make interactive elements (sliders, buttons)
 *
 * Signature: AbilityActiveUINode(atree-merged: MergedATree) => Map<str, slider_info>
 *
 * ElemState: {
 *   value: int     // value for sliders; 0-1 for toggles
 * }
 */
const atree_make_interactives = new (class extends ComputeNode {
    constructor() { super('atree-make-interactives'); }

    compute_func(input_map) {
        const merged_abils = input_map.get('atree-merged');
        const atree_order = input_map.get('atree-order');
        const atree_html = input_map.get('atree-elements');

        /**
         * slider_info 
         *   label_name: str,
         *   max: int,
         *   step: int,
         *   id: str,
         *   abil: atree_node
         *   slider: html element
         * }
         */
        // Map<str, slider_info>
        const slider_map = new Map();
        const button_map = new Map();

        // first, pull out all the sliders.
        for (const [abil_id, ability] of merged_abils.entries()) {
            for (const effect of ability.effects) {
                if (effect['type'] === "stat_scaling" && effect['slider'] === true) {
                    const { slider_name, slider_behavior = 'merge', slider_max, slider_step } = effect;
                    if (slider_map.has(slider_name)) {
                        if (slider_max !== undefined) {
                            const slider_info = slider_map.get(slider_name);
                            slider_info.max += slider_max;
                        }
                    }
                    else if (slider_behavior === 'merge') {
                        slider_map.set(slider_name, {
                            label_name: slider_name,
                            max: slider_max,
                            step: slider_step,
                            id: "ability-slider"+ability.id,
                            //color: effect['slider_color'] TODO: add colors to json
                            abil: ability
                        });
                    }
                }
                if (effect['type'] === "raw_stat" && effect['toggle']) {
                    const { toggle: toggle_name } = effect;
                    button_map.set(toggle_name, {
                        abil: ability
                    });
                }
            }
        }
        // next, render the sliders onto the abilities.
        for (const [slider_name, slider_info] of slider_map.entries()) {
            let slider_container = gen_slider_labeled(slider_info);
            atree_html.get(slider_info.abil.id).appendChild(slider_container);
            slider_info.slider = document.getElementById(slider_info.id);
            slider_info.slider.addEventListener("change", (e) => atree_stats.mark_dirty().update());
        }
        for (const [button_name, button_info] of button_map.entries()) {
            let button = make_elem('button', ["button-boost", "border-0", "text-white", "dark-8u", "dark-shadow-sm"], {
                id: button_info.abil.id,
                textContent: button_name
            });
            button.addEventListener("click", (e) => {
                if (button.classList.contains("toggleOn")) {
                    button.classList.remove("toggleOn");
                } else {
                    button.classList.add("toggleOn");
                }
                atree_stats.mark_dirty().update()
            });
            button_info.button = button;
            atree_html.get(button_info.abil.id).appendChild(button);
        }
        return [slider_map, button_map];
    }
})().link_to(atree_node, 'atree-order').link_to(atree_merge, 'atree-merged').link_to(atree_render_active, 'atree-elements');


/**
 * Collect stats from ability tree.
 * Return StatMap of added stats (incl. cost modifications as raw cost)
 *
 * Signature: AbilityTreeStatsNode(atree-merged: MergedATree, build: Build, atree-interactive: Map<str, slider_info>) => StatMap
 */
const atree_stats = new (class extends ComputeNode {
    constructor() { super('atree-stats-collector'); }

    compute_func(input_map) {
        const atree_merged = input_map.get('atree-merged');
        const item_stats = input_map.get('build').statMap;
        const [slider_map, button_map] = input_map.get('atree-interactive');

        let ret_effects = new Map();
        for (const [abil_id, abil] of atree_merged.entries()) {
            if (abil.effects.length == 0) { continue; }

            for (const effect of abil.effects) {
                switch (effect.type) {
                case 'stat_scaling':
                    if (effect.slider) {
                        if ('output' in effect) { // sometimes nodes will modify slider without having effect.
                            const slider_val = slider_map.get(effect.slider_name).slider.value;
                            let total = Math.floor(round_near(parseInt(slider_val) * effect.scaling[0]));
                            if ('max' in effect && total > effect.max) { total = effect.max; }
                            if (Array.isArray(effect.output)) {
                                for (const output of effect.output) {
                                    if (output.type === 'stat') {   // TODO: prop
                                        merge_stat(ret_effects, output.name, total);
                                    }
                                }
                            }
                            else {
                                if (effect.output.type === 'stat') {
                                    merge_stat(ret_effects, effect.output.name, total);
                                }
                            }
                        }
                    }
                    else {
                        // TODO: type: prop?
                        let total = 0;
                        for (const [scaling, input] of zip2(effect.scaling, effect.inputs)) {
                            total += scaling * item_stats.get(input.name);
                        }
                        if (total < 0) { total = 0; }   // Normal stat scaling will not go negative.
                        if ('max' in effect && total > effect.max) { total = effect.max; }
                        // TODO: output (list...)
                        if (Array.isArray(effect.output)) {
                            for (const output of effect.output) {
                                if (output.type === 'stat') {
                                    merge_stat(ret_effects, output.name, total);
                                }
                            }
                        }
                        else {
                            if (effect.output.type === 'stat') {
                                merge_stat(ret_effects, effect.output.name, total);
                            }
                        }
                    }
                    continue;
                case 'raw_stat':
                    // TODO: toggles...
                    if (effect.toggle) {
                        const button = button_map.get(effect.toggle).button;
                        if (!button.classList.contains("toggleOn")) { continue; }
                    }
                    for (const bonus of effect.bonuses) {
                        const { type, name, abil = "", value } = bonus;
                        // TODO: prop
                        if (type === "stat") {
                            merge_stat(ret_effects, name, value);
                        }
                    }
                    continue;
                case 'add_spell_prop':
                    continue;
                    // TODO unjankify....
                    // costs are converted to raw cost ID
                    // const { base_spell, cost = 0} = effect;
                    // if (cost) {
                    //     const key = "spRaw"+base_spell;
                    //     if (ret_effects.has(key)) { ret_effects.set(key, ret_effects.get(key) + cost); }
                    //     else { ret_effects.set(key, cost); }
                    // }
                    // continue;
                }
            }
        }
        if (ret_effects.has('baseResist')) {
            merge_stat(ret_effects, "defMult", 1 - (ret_effects.get('baseResist') / 100));
        }
        return ret_effects;
    }
})().link_to(atree_merge, 'atree-merged').link_to(atree_make_interactives, 'atree-interactive');


/**
 * Construct compute nodes to link builder items and edit IDs to the appropriate display outputs.
 * To make things a bit cleaner, the compute graph structure goes like
 * [builder, build stats] -> [one agg node that is just a passthrough] -> all the spell calc nodes
 * This way, when things have to be deleted i can just delete one node from the dependencies of builder/build stats...
 * thats the idea anyway.
 *
 * Whenever this is updated, it forces an update of all the newly created spell nodes (if the build is clean).
 *
 * Signature: AbilityEnsureSpellsNodes(spells: Map[id, Spell]) => null
 */
class AbilityTreeEnsureNodesNode extends ComputeNode {
    
    /**
     * Kinda "hyper-node": Constructor takes nodes that should be linked to (build node and stat agg node)
     */
    constructor(build_node, stat_agg_node) {
        super('atree-make-nodes');
        this.build_node = build_node;
        this.stat_agg_node = stat_agg_node;
        // Slight amount of wasted compute to keep internal state non-changing.
        this.passthrough = new PassThroughNode('atree-make-nodes_internal').link_to(this.build_node, 'build').link_to(this.stat_agg_node, 'stats');
        this.spelldmg_nodes = [];   // debugging use
        this.spell_display_elem = document.getElementById("all-spells-display");
    }

    compute_func(input_map) {
        console.log('atree make nodes');
        this.passthrough.remove_link(this.build_node);
        this.passthrough.remove_link(this.stat_agg_node);
        this.passthrough = new PassThroughNode('atree-make-nodes_internal').link_to(this.build_node, 'build').link_to(this.stat_agg_node, 'stats');
        this.spell_display_elem.textContent = "";
        const build_node = this.passthrough.get_node('build');   // aaaaaaaaa performance... savings... help.... 
        const stat_agg_node = this.passthrough.get_node('stats');

        const spell_map = input_map.get('spells');  // TODO: is this gonna need more? idk...
                                                    // TODO shortcut update path for sliders

        for (const [spell_id, spell] of new Map([...spell_map].sort((a, b) => a[0] - b[0])).entries()) {
            let spell_node = new SpellSelectNode(spell);
            spell_node.link_to(build_node, 'build');

            let calc_node = new SpellDamageCalcNode(spell.base_spell);
            calc_node.link_to(build_node, 'build').link_to(stat_agg_node, 'stats')
                .link_to(spell_node, 'spell-info');
            this.spelldmg_nodes.push(calc_node);

            let display_elem = document.createElement('div');
            display_elem.classList.add("col", "pe-0");
            // TODO: just pass these elements into the display node instead of juggling the raw IDs...
            let spell_summary = document.createElement('div'); spell_summary.setAttribute('id', "spell"+spell.base_spell+"-infoAvg");
            spell_summary.classList.add("col", "spell-display", "spell-expand", "dark-5", "rounded", "dark-shadow", "pt-2", "border", "border-dark");
            let spell_detail = document.createElement('div'); spell_detail.setAttribute('id', "spell"+spell.base_spell+"-info");
            spell_detail.classList.add("col", "spell-display", "dark-5", "rounded", "dark-shadow", "py-2");
            spell_detail.style.display = "none";

            display_elem.appendChild(spell_summary); display_elem.appendChild(spell_detail);

            let display_node = new SpellDisplayNode(spell.base_spell);
            display_node.link_to(stat_agg_node, 'stats');
            display_node.link_to(spell_node, 'spell-info');
            display_node.link_to(calc_node, 'spell-damage');

            this.spell_display_elem.appendChild(display_elem);
        }
        this.passthrough.mark_dirty().update(); // Force update once.
    }
}

/** The main function for rendering an ability tree. 
 * 
 * @param {Element} UI_elem - the DOM element to draw the atree within.
 * @param {Element} list_elem - the DOM element to list selected abilities within.
 * @param {*} tree - the ability tree to work with.
 */
function render_AT(UI_elem, list_elem, tree) {
    console.log("constructing ability tree UI");

    // increase padding, since images are larger than the space provided
    UI_elem.style.paddingRight = "calc(var(--bs-gutter-x) * 1)";
    UI_elem.style.paddingLeft = "calc(var(--bs-gutter-x) * 1)";
    UI_elem.style.paddingTop = "calc(var(--bs-gutter-x) * .5)";

    // add in the "Active" title to atree
    let active_row = make_elem("div", ["row", "item-title", "mx-auto", "justify-content-center"]);
    let active_word = make_elem("div", ["col-auto"], {textContent: "Active Abilities:"});

    let active_AP_container = make_elem("div", ["col-auto"]);
    let active_AP_subcontainer = make_elem("div", ["row"]);
    let active_AP_cost = make_elem("div", ["col-auto", "mx-0", "px-0"], {id: "active_AP_cost", textContent: "0"});

    let active_AP_slash = make_elem("div", ["col-auto", "mx-0", "px-0"], {textContent: "/"});
    let active_AP_cap = make_elem("div", ["col-auto", "mx-0", "px-0"], {id: "active_AP_cap"});
    let active_AP_end = make_elem("div", ["col-auto", "mx-0", "px-0"], {textContent: " AP"});

    active_AP_container.appendChild(active_AP_subcontainer);
    active_AP_subcontainer.append(active_AP_cost, active_AP_slash, active_AP_cap, active_AP_end);

    active_row.append(active_word, active_AP_container);
    list_elem.appendChild(active_row);

    let atree_map = new Map();
    let atree_connectors_map = new Map()
    let max_row = 0;
    for (const i of tree) {
        atree_map.set(i.ability.id, {ability: i.ability, connectors: new Map(), active: false});
        if (i.ability.display.row > max_row) {
            max_row = i.ability.display.row;
        }
    }
    // Copy graph structure.
    for (const i of tree) {
        let node_wrapper = atree_map.get(i.ability.id);
        node_wrapper.parents = [];
        node_wrapper.children = [];
        for (const parent of i.parents) {
            node_wrapper.parents.push(atree_map.get(parent.ability.id));
        }
        for (const child of i.children) {
            node_wrapper.children.push(atree_map.get(child.ability.id));
        }
    }

    // Setup grid.
    for (let j = 0; j <= max_row; j++) {
        let row = document.createElement('div');
        row.classList.add("row");
        row.id = "atree-row-" + j;

        for (let k = 0; k < 9; k++) {
            col = document.createElement('div');
            col.classList.add('col', 'px-0');
            col.style = "position: relative; aspect-ratio: 1/1;"
            row.appendChild(col);
        }
        UI_elem.appendChild(row);
    }

    for (const _node of tree) {
        let node_wrap = atree_map.get(_node.ability.id);
        let ability = _node.ability;

        // create connectors based on parent location
        for (let parent of node_wrap.parents) {
            node_wrap.connectors.set(parent, []);

            let parent_abil = parent.ability;
            const parent_id = parent_abil.id;

            let connect_elem = document.createElement("div");
            connect_elem.style = "background-size: cover; width: 200%; height: 200%; position: absolute; top: -50%; left: -50%; image-rendering: pixelated;";
            // connect up
            for (let i = ability.display.row - 1; i > parent_abil.display.row; i--) {
                const coord = i + "," + ability.display.col;
                let connector = connect_elem.cloneNode();
                node_wrap.connectors.get(parent).push(coord);
                resolve_connector(atree_connectors_map, coord, {connector: connector, connections: [0, 0, 1, 1]});
            }
            // connect horizontally
            let min = Math.min(parent_abil.display.col, ability.display.col);
            let max = Math.max(parent_abil.display.col, ability.display.col);
            for (let i = min + 1; i < max; i++) {
                const coord = parent_abil.display.row + "," + i;
                let connector = connect_elem.cloneNode();
                node_wrap.connectors.get(parent).push(coord);
                resolve_connector(atree_connectors_map, coord, {connector: connector, connections: [1, 1, 0, 0]});
            }

            // connect corners
            if (parent_abil.display.row != ability.display.row && parent_abil.display.col != ability.display.col) {
                const coord = parent_abil.display.row + "," + ability.display.col;
                let connector = connect_elem.cloneNode();
                node_wrap.connectors.get(parent).push(coord);
                let connections = [0, 0, 0, 1];
                if (parent_abil.display.col > ability.display.col) {
                    connections[1] = 1;
                }
                else {// if (parent_node.display.col < node.display.col && (parent_node.display.row != node.display.row)) {
                    connections[0] = 1;
                }
                resolve_connector(atree_connectors_map, coord, {connector: connector, connections: connections});
            }
        }

        // create node
        let node_elem = document.createElement('div');
        let icon = ability.display.icon;
        if (icon === undefined) {
            icon = "node";
        }
        let node_img = document.createElement('img');
        node_img.src = '../media/atree/'+icon+'.png';
        node_img.style = "width: 200%; height: 200%; position: absolute; top: -50%; left: -50%; image-rendering: pixelated; z-index: 1;";
        node_elem.appendChild(node_img);

        node_wrap.img = node_img;

        // create hitbox
        // this is necessary since images exceed the size of their square, but should only be interactible within that square
        let hitbox = document.createElement("div");
        hitbox.style = "position: absolute; cursor: pointer; left: 0; top: 0; width: 100%; height: 100%; z-index: 2;"
        node_elem.appendChild(hitbox);

        node_wrap.elem = node_elem;
        node_wrap.all_connectors_ref = atree_connectors_map;

        hitbox.addEventListener('click', function(e) {
            if (e.target !== this && e.target!== this.children[0]) {return;}
            atree_set_state(node_wrap, !node_wrap.active);
            atree_state_node.mark_dirty().update();
        });

        // add tooltip
        // tooltips are being changed to generate on mouseover for fin444's future style updates
        // this is being implemented before those updates since it helps with a hotfix
        hitbox.addEventListener('mouseover', function(e) {
            if (e.target !== this) {
                return;
            }
            if (node_wrap.tooltip_elem) {
                node_wrap.tooltip_elem.remove();
                delete node_wrap.tooltip_elem;
            }
            node_wrap.tooltip_elem = generateTooltip(UI_elem, node_elem, ability);
        });

        hitbox.addEventListener('mouseout', function(e) {
            if (e.target !== this) {
                return;
            }
            if (node_wrap.tooltip_elem) {
                node_wrap.tooltip_elem.remove();
                delete node_wrap.tooltip_elem;
            }
        });

        document.getElementById("atree-row-" + ability.display.row).children[ability.display.col].appendChild(node_elem);
    };
    atree_render_connection(atree_connectors_map);

    return atree_map;
};

function generateTooltip(UI_elem, node_elem, ability) {
    let tooltip = document.createElement('div');
    tooltip.classList.add("rounded-bottom", "dark-4", "border", "p-0", "mx-2", "my-4", "dark-shadow");

    // tooltip text formatting

    let tooltip_title = document.createElement('b');
    tooltip_title.classList.add("scaled-font");
    tooltip_title.innerHTML = ability.display_name;
    tooltip.appendChild(tooltip_title);

    if ('archetype' in ability && ability.archetype !== "") {
        let tooltip_archetype = document.createElement('p');
        tooltip_archetype.classList.add("scaled-font");
        tooltip_archetype.innerHTML = "(Archetype: " + ability.archetype+")";
        tooltip.appendChild(tooltip_archetype);
    }

    let tooltip_desc = document.createElement('p');
    tooltip_desc.classList.add("scaled-font-sm", "my-0", "mx-1", "text-wrap");
    tooltip_desc.textContent = ability.desc;
    tooltip.appendChild(tooltip_desc);

    let tooltip_cost = document.createElement('p');
    tooltip_cost.classList.add("scaled-font-sm", "my-0", "mx-1", "text-start");
    tooltip_cost.textContent = "Cost: " + ability.cost + " AP";
    tooltip.appendChild(tooltip_cost);

    tooltip.style.position = "absolute";
    tooltip.style.zIndex = "100";
    tooltip.style.top = (node_elem.getBoundingClientRect().top + window.pageYOffset + 50) + "px";
    tooltip.style.left = UI_elem.getBoundingClientRect().left + "px";
    tooltip.style.width = UI_elem.getBoundingClientRect().width * 0.95 + "px";

    UI_elem.appendChild(tooltip);
    return tooltip;
}

// resolve connector conflict, when they occupy the same cell.
function resolve_connector(atree_connectors_map, pos, new_connector) {
    if (!atree_connectors_map.has(pos)) {
        atree_connectors_map.set(pos, new_connector);
        return;
    }
    let existing = atree_connectors_map.get(pos).connections;
    for (let i = 0; i < 4; ++i) {
        existing[i] += new_connector.connections[i];
    }
}

function set_connector_type(connector_info) {  // left right up down
    connector_info.type = "";
    for (let i = 0; i < 4; i++) {
        connector_info.type += connector_info.connections[i] == 0 ? "0" : "1";
    }
}

// draw the connector onto the screen
function atree_render_connection(atree_connectors_map) {
    for (let i of atree_connectors_map.keys()) {
        let connector_info = atree_connectors_map.get(i);
        let connector_elem = connector_info.connector;
        let connector_img = document.createElement('img');
        set_connector_type(connector_info);
        connector_img.src = '../media/atree/connect_'+connector_info.type+'.png';
        connector_img.style = "width: 100%; height: 100%;"
        connector_elem.replaceChildren(connector_img);
        connector_info.highlight = [0, 0, 0, 0];
        let target_elem = document.getElementById("atree-row-" + i.split(",")[0]).children[i.split(",")[1]];
        if (target_elem.children.length != 0) {
            // janky special case...
            connector_elem.style.display = 'none';
        }
        target_elem.appendChild(connector_elem);
    };
};

// toggle the state of a node.
function atree_set_state(node_wrapper, new_state) {
    let icon = node_wrapper.ability.display.icon;
    if (icon === undefined) {
        icon = "node";
    }
    if (new_state) {
        node_wrapper.active = true;
        node_wrapper.elem.children[0].src = "../media/atree/" + icon + "_selected.png";
    } 
    else {
        node_wrapper.active = false;
        node_wrapper.elem.children[0].src = "../media/atree/" + icon + ".png";
    }
    let atree_connectors_map = node_wrapper.all_connectors_ref;
    for (const parent of node_wrapper.parents) {
        if (parent.active) {
            atree_set_edge(atree_connectors_map, parent, node_wrapper, new_state);  // self->parent state only changes if parent is on
        }
    }
    for (const child of node_wrapper.children) {
        if (child.active) {
            atree_set_edge(atree_connectors_map, node_wrapper, child, new_state);   // Same logic as above.
        }
    }
};

function atree_set_edge(atree_connectors_map, parent, child, state) {
    const connectors = child.connectors.get(parent);
    const parent_row = parent.ability.display.row;
    const parent_col = parent.ability.display.col;
    const child_row = child.ability.display.row;
    const child_col = child.ability.display.col;

    let state_delta = (state ? 1 : -1);
    let child_side_idx = (parent_col > child_col ? 0 : 1);
    let parent_side_idx = 1 - child_side_idx;
    for (const connector_label of connectors) {
        let connector_info = atree_connectors_map.get(connector_label);
        let connector_elem = connector_info.connector;
        let highlight_state = connector_info.highlight; // left right up down
        let connector_img_elem = document.createElement("img");
        connector_img_elem.style = "width: 100%; height: 100%;";
        const ctype = connector_info.type;
        let num_1s = 0;
        for (let i = 0; i < 4; i++) {
            if (ctype.charAt(i) == "1") {
                num_1s++;
            }
        }
        if (num_1s > 2) { // t branch or 4-way
            const [connector_row, connector_col] = connector_label.split(',').map(x => parseInt(x));

            if (connector_row === parent_row) {
                highlight_state[parent_side_idx] += state_delta;
            }
            else {
                highlight_state[2] += state_delta;  // up connection guaranteed.
            }
            if (connector_col === child_col) {
                highlight_state[3] += state_delta;
            }
            else {
                highlight_state[child_side_idx] += state_delta;
            }

            let render = "";
            for (let i = 0; i < 4; i++) {
                render += highlight_state[i] === 0 ? "0" : "1";
            }
            if (render == "0000") {
                connector_img_elem.src = "../media/atree/connect_" + ctype + ".png";
            } else {
                connector_img_elem.src = "../media/atree/connect_" + ctype + "_" + render + ".png";
            }
            connector_elem.replaceChildren(connector_img_elem);
            continue;
        }
        // lol bad overloading, [0] is just the whole state
        highlight_state[0] += state_delta;
        if (highlight_state[0] > 0) {
            connector_img_elem.src = '../media/atree/connect_' + ctype + '_1.png';
            connector_elem.replaceChildren(connector_img_elem);
        }
        else {
            connector_img_elem.src = '../media/atree/connect_'+ctype+'.png';
            connector_elem.replaceChildren(connector_img_elem);
        }
    }
}
