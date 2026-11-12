/* Saved hosts and pairing entry point, navigable with the controller. */
(function (global) {
    "use strict";
    function create(options) {
        var element = global.MoonlightLayout.element;
        var panel = element("div", options.parent, {
            display:"none",flexDirection:"column",width:"600px",maxWidth:"88vw",maxHeight:"800px",
            padding:"32px",border:"1px solid #29354b",borderRadius:"18px",backgroundColor:"#131d2e",boxSizing:"border-box"
        });
        panel.id = "moonlight-hosts-screen";
        var heading = element("div", panel, {display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"20px",flexShrink:"0"});
        var titles = element("div", heading, {});
        element("div", titles, {fontSize:"17px",color:"#94b6e2",marginBottom:"6px"}, "Moonlight");
        element("h2", titles, {fontSize:"36px",lineHeight:"1.2",margin:"0",color:"#f4f7ff"}, "Hosts");
        var buttonStyle = {
            display:"flex",alignItems:"center",justifyContent:"center",width:"100%",minHeight:"58px",padding:"12px 16px",
            border:"2px solid #35435b",borderRadius:"9px",backgroundColor:"#0c1423",color:"#f4f7ff",
            fontFamily:"Arial, sans-serif",fontSize:"22px",outline:"none",boxSizing:"border-box",flexShrink:"0"
        };
        var settings = element("button", heading, Object.assign({}, buttonStyle, {width:"auto",minHeight:"46px",fontSize:"18px"}), "Settings");
        settings.id = "moonlight-open-settings";
        settings.type = "button";
        settings.tabIndex = -1;
        var list = element("div", panel, {display:"flex",flexDirection:"column",overflowY:"auto",minHeight:"0"});
        list.id = "moonlight-host-list";
        var status = element("div", panel, {minHeight:"24px",marginTop:"18px",fontSize:"16px",lineHeight:"1.5",color:"#b7c6dd",flexShrink:"0"});
        status.id = "moonlight-hosts-status";
        status.setAttribute("role", "status");
        var controls = [], actions = [], rows = [], selected = 1;
        function paint() {
            controls.forEach(function (control, index) {
                var active = selected === index;
                control.style.borderColor = active ? "#94c6ff" : "#35435b";
                control.style.backgroundColor = active ? "#284c83" : "#0c1423";
                control.setAttribute("data-selected", active ? "true" : "false");
            });
            var node = controls[selected];
            if (node && node.parentNode.parentNode === list) node = node.parentNode;
            if (node && node.parentNode === list) {
                if (node.offsetTop < list.scrollTop) list.scrollTop = node.offsetTop;
                else if (node.offsetTop + node.offsetHeight > list.scrollTop + list.clientHeight)
                    list.scrollTop = node.offsetTop + node.offsetHeight - list.clientHeight;
            }
        }
        function activate() {
            // Controller activation must not depend on synthesized DOM clicks.
            if (actions[selected]) actions[selected]();
        }
        settings.addEventListener("click", function () { selected = 0; paint(); options.onSettings(); });
        return {
            show: function (hosts, address, message) {
                list.textContent = "";
                list.style.position = "relative";
                controls = [settings];
                actions = [options.onSettings];
                rows = [[0]];
                selected = 1;
                hosts.forEach(function (host) {
                    var row = element("div", list, {display:"flex",alignItems:"stretch",marginBottom:"12px",flexShrink:"0"});
                    var button = element("button", row, Object.assign({}, buttonStyle, {flexDirection:"column",alignItems:"flex-start",flex:"1",minWidth:"0",width:"auto",textAlign:"left"}));
                    button.type = "button";
                    button.tabIndex = -1;
                    button.setAttribute("data-host-address", host.address);
                    button.setAttribute("aria-label", host.hostname + ", " + host.address);
                    element("span", button, {maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:"700"}, host.hostname);
                    element("span", button, {fontSize:"17px",color:"#b7c6dd",marginTop:"5px"}, host.address);
                    var index = controls.length;
                    if (host.address === address) selected = index;
                    button.addEventListener("click", function () { selected = index; paint(); options.onHost(host); });
                    controls.push(button);
                    actions.push(function () { options.onHost(host); });
                    var remove = element("button", row, Object.assign({}, buttonStyle, {width:"auto",marginLeft:"12px",color:"#ffb6b6"}), "Delete");
                    remove.type = "button";
                    remove.tabIndex = -1;
                    remove.setAttribute("data-delete-host", host.address);
                    remove.setAttribute("aria-label", "Delete " + host.hostname + ", " + host.address);
                    function deleteHost() { options.onDelete(host); }
                    remove.addEventListener("click", function () { selected = index + 1; paint(); deleteHost(); });
                    controls.push(remove);
                    actions.push(deleteHost);
                    rows.push([index, index + 1]);
                });
                var pair = element("button", list, buttonStyle, "Pair new host");
                pair.id = "moonlight-pair-new-host";
                pair.type = "button";
                pair.tabIndex = -1;
                pair.addEventListener("click", options.onPair);
                controls.push(pair);
                actions.push(options.onPair);
                rows.push([controls.length - 1]);
                status.textContent = message || (hosts.length ? "Choose a host to open its games." : "No paired hosts yet. Choose Pair new host to get started.");
                panel.style.display = "flex";
                paint();
            },
            hide: function () { panel.style.display = "none"; },
            resume: function () { panel.style.display = "flex"; paint(); },
            move: function (direction) {
                var rowIndex = rows.findIndex(function (row) { return row.indexOf(selected) >= 0; });
                var column = rows[rowIndex].indexOf(selected);
                if (direction === "up" || direction === "down") {
                    rowIndex = Math.max(0, Math.min(rows.length - 1, rowIndex + (direction === "up" ? -1 : 1)));
                    selected = rows[rowIndex][Math.min(column, rows[rowIndex].length - 1)];
                } else if (direction === "left" || direction === "right") {
                    selected = rows[rowIndex][direction === "left" ? 0 : rows[rowIndex].length - 1];
                }
                paint();
            },
            step: function (delta) { selected = (selected + delta + controls.length) % controls.length; paint(); },
            activate: activate,
            destroy: function () { if (panel.parentNode) panel.parentNode.removeChild(panel); }
        };
    }
    global.MoonlightHosts = {create:create};
})(typeof window !== "undefined" ? window : globalThis);
