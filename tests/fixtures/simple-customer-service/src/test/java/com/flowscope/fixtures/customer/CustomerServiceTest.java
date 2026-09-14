package com.flowscope.fixtures.customer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class CustomerServiceTest {

    @Test
    void registersANewCustomer() {
        CustomerService service = new CustomerService();

        Customer customer = service.register("jane@example.com", "Jane Doe");

        assertNotNull(customer.getId());
        assertEquals("jane@example.com", customer.getEmail());
    }

    @Test
    void rejectsADuplicateEmail() {
        CustomerService service = new CustomerService();
        service.register("jane@example.com", "Jane Doe");

        assertThrows(IllegalStateException.class, () -> service.register("jane@example.com", "Jane Two"));
    }
}
