package com.flowscope.fixtures.customer;

public class Customer {

    private final String id;
    private final String email;
    private final String fullName;

    public Customer(String id, String email, String fullName) {
        this.id = id;
        this.email = email;
        this.fullName = fullName;
    }

    public String getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getFullName() {
        return fullName;
    }
}
