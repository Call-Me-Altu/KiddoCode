// Wait until DOM loads
document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("demoBookingForm");
    const successMessage = document.getElementById("formSuccessMessage");

    if (!form) {
        console.error("Form not found!");
        return;
    }

    // Real-time validation
    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");
    const courseSelect = document.getElementById("courseSelect");
    const dateInput = document.getElementById("demoDate");
    const timeInput = document.getElementById("demoTime");
    const timezoneSelect = document.getElementById("timeZone");

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    if (dateInput) {
        dateInput.setAttribute('min', today);
    }

    // Real-time validation functions
    function validateName() {
        const name = nameInput.value.trim();
        const errorSpan = document.getElementById("nameError");
        if (name.length < 2) {
            errorSpan.textContent = "Name must be at least 2 characters";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    function validateEmail() {
        const email = emailInput.value.trim();
        const errorSpan = document.getElementById("emailError");
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errorSpan.textContent = "Please enter a valid email address";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    function validatePhone() {
        const phone = phoneInput.value.trim();
        const errorSpan = document.getElementById("phoneError");
        const phoneRegex = /^[0-9]{10,15}$/;
        if (!phoneRegex.test(phone)) {
            errorSpan.textContent = "Please enter a valid phone number (10-15 digits)";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    function validateCourse() {
        const course = courseSelect.value;
        const errorSpan = document.getElementById("courseError");
        if (!course) {
            errorSpan.textContent = "Please select a course";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    function validateTimezone() {
        const timezone = timezoneSelect.value;
        const errorSpan = document.getElementById("timeZoneError");
        if (!timezone) {
            errorSpan.textContent = "Please select a timezone";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    function validateDate() {
        const date = dateInput.value;
        const errorSpan = document.getElementById("dateError");
        if (!date) {
            errorSpan.textContent = "Please select a date";
            return false;
        }
        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
            errorSpan.textContent = "Please select today or a future date";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    function validateTime() {
        const time = timeInput.value;
        const errorSpan = document.getElementById("timeError");
        if (!time) {
            errorSpan.textContent = "Please select a time";
            return false;
        }
        errorSpan.textContent = "";
        return true;
    }

    // Add event listeners for real-time validation
    nameInput.addEventListener("input", validateName);
    emailInput.addEventListener("input", validateEmail);
    phoneInput.addEventListener("input", validatePhone);
    courseSelect.addEventListener("change", validateCourse);
    timezoneSelect.addEventListener("change", validateTimezone);
    dateInput.addEventListener("change", validateDate);
    timeInput.addEventListener("change", validateTime);

    // Form submission
    form.addEventListener("submit", async function (e) {
        e.preventDefault();

        // Run all validations
        const isNameValid = validateName();
        const isEmailValid = validateEmail();
        const isPhoneValid = validatePhone();
        const isCourseValid = validateCourse();
        const isTimezoneValid = validateTimezone();
        const isDateValid = validateDate();
        const isTimeValid = validateTime();

        if (!isNameValid || !isEmailValid || !isPhoneValid || !isCourseValid || 
            !isTimezoneValid || !isDateValid || !isTimeValid) {
            alert("Please fix all errors before submitting ❌");
            return;
        }

        // Get form values
        const formData = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim(),
            course: courseSelect.value,
            timezone: timezoneSelect.value,
            date: dateInput.value,
            time: timeInput.value
        };

        // Show loading state
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        submitButton.textContent = "Scheduling... ⏳";
        submitButton.disabled = true;

        try {
            // Send data to backend
const response = await fetch("https://kiddocode.onrender.com/send-demo", {fetch("https://kiddocode.onrender.com/send-demo", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify(formData)
});
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Something went wrong");
            }

            if (data.message) {
                // Show success message
                successMessage.classList.remove("hidden");
                
                // Reset form
                form.reset();
                
                // Clear error messages
                document.querySelectorAll('.error-msg').forEach(msg => msg.textContent = "");
                
                // Scroll to success message
                successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
                
                // Hide success after 5 seconds
                setTimeout(() => {
                    successMessage.classList.add("hidden");
                }, 5000);
            } else {
                alert("Something went wrong ❌");
            }
        } catch (error) {
            console.error("Fetch error:", error);
            alert(error.message || "Failed to book demo. Please try again later. ❌");
        } finally {
            // Reset button
            submitButton.textContent = originalButtonText;
            submitButton.disabled = false;
        }
    });
});
