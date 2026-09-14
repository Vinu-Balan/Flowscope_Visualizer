package com.flowscope.fixtures.customer;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class CustomerService {

    private final Map<String, Customer> customersById = new HashMap<>();

    public Customer register(String email, String fullName) {
        if (existsByEmail(email)) {
            throw new IllegalStateException("Customer already exists: " + email);
        }
        Customer customer = new Customer(UUID.randomUUID().toString(), email, fullName);
        customersById.put(customer.getId(), customer);
        return customer;
    }

    public boolean existsByEmail(String email) {
        return customersById.values().stream().anyMatch(customer -> customer.getEmail().equals(email));
    }

    public Customer findById(String id) {
        return customersById.get(id);
    }
}
