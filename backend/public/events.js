function showEventManagement() {
    // Get authToken from the main page's global scope
    const token = window.authToken;
    
    if (!token) {
        alert("Not authenticated - please log in");
        return;
    }
    
    fetch("/api/events", {
        headers: { "Authorization": `Bearer ${token}` }
    })
    .then(response => response.json())
    .then(data => {
        alert(`Found ${data.events.length} events: ${data.events.map(e => e.description).join(", ")}`);
    })
    .catch(error => {
        alert("Error: " + error.message);
    });
}
